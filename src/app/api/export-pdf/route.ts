import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import puppeteer from "puppeteer";
import { verifyProfessorPermission } from "@/lib/notion";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export async function POST(req: NextRequest) {
  try {
    // 1. Get user session to retrieve Google Access Token
    const session: any = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: "인증되지 않은 사용자입니다. 구글 로그인을 확인해 주세요." }, { status: 401 });
    }
    if ((session as any).error) {
      return NextResponse.json({ error: "구글 인증이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요." }, { status: 401 });
    }
    const sessionEmail = session?.user?.email;

    const { action, sessionName, studentId, studentName, folderId, period, historyPeriod } = await req.json();
    const accessToken = session.accessToken;

    // 2. Verify Access Permission & Division Permission
    const perm = await verifyProfessorPermission(sessionEmail, action === "export_pdf" ? studentId : undefined);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    // Google Token validation & debug logger
    try {
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
      const infoData = await infoRes.json();
      if (infoRes.ok) {
        console.log(`[Google Token Info] Valid token, scopes: ${infoData.scope}, expires_in: ${infoData.expires_in}s, email: ${infoData.email}`);
      } else {
        console.error(`[Google Token Info] Invalid token response:`, infoData);
      }
    } catch (tokenErr) {
      console.error("[Google Token Info] Failed to check tokeninfo:", tokenErr);
    }

    // Action A: Create Folder in Google Drive
    if (action === "create_folder") {
      if (!sessionName) {
        return NextResponse.json({ error: "세션명이 필요합니다." }, { status: 400 });
      }

      // Search if folder already exists
      const query = encodeURIComponent(`name = '${sessionName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const searchData = await searchRes.json();

      if (searchData.files && searchData.files.length > 0) {
        return NextResponse.json({ folderId: searchData.files[0].id, msg: "기존 폴더 사용" });
      }

      // Create new folder
      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sessionName,
          mimeType: "application/vnd.google-apps.folder",
        }),
      });
      const createData = await createRes.json();

      if (createData.error) {
        throw new Error(createData.error.message || "구글 드라이브 폴더 생성 실패");
      }

      return NextResponse.json({ folderId: createData.id, msg: "새 폴더 생성 완료" });
    }

    // Action B: Render PDF and Upload to Folder
    if (action === "export_pdf") {
      if (!studentId || !studentName || !folderId) {
        return NextResponse.json({ error: "필수 정보(studentId, studentName, folderId)가 누락되었습니다." }, { status: 400 });
      }

      // Determine local port
      const port = process.env.PORT || 3000;
      const baseUrl = `http://localhost:${port}`;
      const targetUrl = `${baseUrl}/board?student=${studentId}&pdfMode=true&period=${period || "3w"}&historyPeriod=${historyPeriod || "2w"}`;

      console.log(`Rendering PDF for ${studentName} at: ${targetUrl}`);

      const userDataDir = await mkdtemp(join(tmpdir(), "scl-chrome-profile-"));
      const crashDumpsDir = join(tmpdir(), "scl-chrome-crashes");
      await mkdir(crashDumpsDir, { recursive: true });

      let browser;
      let pdfBuffer: Buffer;
      try {
        // Launch Puppeteer browser
        browser = await puppeteer.launch({
          headless: true,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          userDataDir,
          env: {
            ...process.env,
            HOME: tmpdir(),
            XDG_CONFIG_HOME: tmpdir(),
            XDG_CACHE_HOME: tmpdir(),
          },
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-crash-reporter",
            "--disable-crashpad",
            "--disable-breakpad",
            `--crash-dumps-dir=${crashDumpsDir}`,
            "--no-zygote",
          ],
        });

        const page = await browser.newPage();
        
        // Set viewport to match standard A4 page width at 96 DPI (approx 800px)
        await page.setViewport({ width: 800, height: 1130 });

        // Navigate and wait
        await page.goto(targetUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        // Render page to PDF
        pdfBuffer = Buffer.from(await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "20mm",
            right: "15mm",
            bottom: "20mm",
            left: "15mm",
          },
        }));
      } finally {
        if (browser) {
          await browser.close().catch(() => undefined);
        }
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }

      // Upload PDF to Google Drive folder using Multipart related upload
      const metadata = {
        name: `${studentName}.pdf`,
        parents: [folderId],
        mimeType: "application/pdf",
      };

      const boundary = "multipart_boundary_scl";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody = Buffer.concat([
        Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + delimiter),
        Buffer.from('Content-Type: application/pdf\r\n\r\n'),
        Buffer.from(pdfBuffer),
        Buffer.from(closeDelimiter),
      ]);

      const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length),
        },
        body: multipartBody,
      });

      const uploadData = await uploadRes.json();

      if (uploadData.error) {
        throw new Error(uploadData.error.message || "구글 드라이브 파일 업로드 실패");
      }

      return NextResponse.json({ success: true, fileId: uploadData.id });
    }

    return NextResponse.json({ error: "잘못된 요청 액션입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Error in export-pdf API route:", error);
    return NextResponse.json({ error: error.message || "PDF 내보내기 실패" }, { status: 500 });
  }
}
