import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchStudents, verifyProfessorPermission } from "@/lib/notion";
import { normalizeSemester } from "@/lib/semester";
import puppeteer from "puppeteer-core";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "교수 로그인이 필요합니다." }, { status: 401 });
    }
    const body = await req.json();
    const semester = normalizeSemester(body.semester);
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    const reportAdvice = typeof body.reportAdvice === "string" ? body.reportAdvice.slice(0, 20000) : undefined;
    if (!studentId) return NextResponse.json({ error: "학생 ID가 필요합니다." }, { status: 400 });
    const permission = await verifyProfessorPermission(session.user.email, studentId);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.error }, { status: 403 });
    }
    const student = (await fetchStudents(semester)).find((item) => item.id === studentId);
    if (!student) return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });

    const query = new URLSearchParams({
      student: student.id,
      semester,
      pdfMode: "true",
      period: "all",
      historyPeriod: "3w",
    });
    const targetUrl = `${req.nextUrl.origin}/board?${query.toString()}`;
    const userDataDir = await mkdtemp(join(tmpdir(), "scl-chrome-profile-"));
    const crashDumpsDir = join(tmpdir(), "scl-chrome-crashes");
    await mkdir(crashDumpsDir, { recursive: true });

    let browser;
    let pdfBuffer: Buffer;
    try {
      const isVercel = Boolean(process.env.VERCEL);
      const chromium = isVercel ? (await import("@sparticuz/chromium-min")).default : null;
      const executablePath = chromium
        ? await chromium.executablePath(`${req.nextUrl.origin}/chromium-pack.tar`)
        : process.env.PUPPETEER_EXECUTABLE_PATH || await ((await import("puppeteer")).default.executablePath());
      browser = await puppeteer.launch({
        headless: true,
        executablePath,
        userDataDir,
        env: {
          ...process.env,
          HOME: tmpdir(),
          XDG_CONFIG_HOME: tmpdir(),
          XDG_CACHE_HOME: tmpdir(),
        },
        args: [
          ...(chromium?.args || []),
          "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
          "--disable-gpu", "--disable-crash-reporter", "--disable-crashpad",
          "--disable-breakpad", `--crash-dumps-dir=${crashDumpsDir}`, "--no-zygote",
        ],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 1130 });
      if (reportAdvice !== undefined) {
        await page.evaluateOnNewDocument((advice) => {
          (window as Window & { __SCL_REPORT_ADVICE__?: string }).__SCL_REPORT_ADVICE__ = advice;
        }, reportAdvice);
      }
      await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });
      await page.waitForSelector('[data-pdf-ready="true"]', { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), { timeout: 15000 }).catch(() => undefined);
      pdfBuffer = Buffer.from(await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      }));
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${student.cls}_${student.name}.pdf`)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error creating PDF:", error);
    const message = error instanceof Error ? error.message : "PDF 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
