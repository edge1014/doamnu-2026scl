import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchProfessors } from "@/lib/notion";

const driveImageRootFolderId = process.env.GOOGLE_DRIVE_IMAGE_ROOT_FOLDER_ID;
const driveImageRootFolderName = process.env.GOOGLE_DRIVE_IMAGE_ROOT_FOLDER_NAME || "doamnu-scl-critic-image-2026";
const isProduction = process.env.NODE_ENV === "production";

// In-memory cache: avoids redundant Drive API calls within a Cloud Run instance's lifetime
const folderCache = new Map<string, string>();

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateDriveFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const cacheKey = `${parentId ?? "root"}::${name}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const escapedName = escapeDriveQueryValue(name);
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const query = encodeURIComponent(
    `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`
  );

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();
  if (!searchRes.ok || searchData.error) {
    throw new Error(searchData.error?.message || "구글 드라이브 폴더 조회 실패");
  }
  if (searchData.files?.length > 0) {
    const id = searchData.files[0].id;
    folderCache.set(cacheKey, id);
    return id;
  }

  const metadata: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  const createData = await createRes.json();
  if (!createRes.ok || createData.error) {
    throw new Error(createData.error?.message || "구글 드라이브 폴더 생성 실패");
  }

  folderCache.set(cacheKey, createData.id);
  return createData.id;
}

async function uploadImageToDrive(accessToken: string, folderId: string, filename: string, imageBuffer: Buffer) {
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: "image/jpeg",
  };

  const boundary = "multipart_boundary_scl_image";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + delimiter),
    Buffer.from("Content-Type: image/jpeg\r\n\r\n"),
    imageBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartBody.length),
    },
    body: multipartBody,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || uploadData.error) {
    throw new Error(uploadData.error?.message || "구글 드라이브 이미지 업로드 실패");
  }

  const permissionRes = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone",
    }),
  });
  const permissionData = await permissionRes.json().catch(() => null);
  if (!permissionRes.ok || permissionData?.error) {
    throw new Error(permissionData?.error?.message || "구글 드라이브 이미지 공유 권한 설정 실패");
  }

  return {
    fileId: uploadData.id,
    imageUrl: `https://lh3.googleusercontent.com/d/${uploadData.id}`,
    webViewLink: uploadData.webViewLink,
  };
}

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    if (!sessionEmail || !session?.accessToken) {
      return NextResponse.json({ error: "로그인이 필요합니다. 구글 로그인을 다시 확인해 주세요." }, { status: 401 });
    }
    if (session.error) {
      return NextResponse.json({ error: "구글 인증이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요." }, { status: 401 });
    }
    const accessToken = session.accessToken;

    const formData = await req.formData();
    const studentCls = formData.get("studentCls") as string;

    // Verify if professor is registered and has access to this class division
    const professors = await fetchProfessors();
    const matchedProf = professors.find(p => p.email.toLowerCase() === sessionEmail.toLowerCase());
    
    if (!matchedProf) {
      return NextResponse.json({ error: "등록되지 않은 교수 계정입니다. 교수 등록을 완료해 주세요." }, { status: 403 });
    }
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "파일이 제공되지 않았습니다." }, { status: 400 });
    }

    const studentName = formData.get("studentName") as string;
    const studentOrder = formData.get("studentOrder") as string;
    const sessionDate = formData.get("sessionDate") as string;

    // Process file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 1. Resize image to 800 * 500 using sharp
    const resizedBuffer = await sharp(buffer)
      .resize(800, 500, {
        fit: "cover", // Crop/fit to exact dimensions
      })
      .toFormat("jpeg", { quality: 85 })
      .toBuffer();

    // 2. Determine target naming and path
    const formattedOrder = studentOrder ? String(studentOrder).padStart(2, "0") : "00";
    const cleanName = studentName ? studentName.trim() : "학생";
    const filename = `${formattedOrder}_${cleanName}.jpg`;

    const dateStr = sessionDate ? sessionDate.trim() : new Date().toISOString().split("T")[0];
    const clsStr = studentCls ? studentCls.trim() : "1분반";

    // 3. Upload to Google Drive:
    // root/date/대표이미지/class/01_학생.jpg
    try {
      const rootFolderId = driveImageRootFolderId || await findOrCreateDriveFolder(accessToken, driveImageRootFolderName);
      const dateFolderId = await findOrCreateDriveFolder(accessToken, dateStr, rootFolderId);
      const imageFolderId = await findOrCreateDriveFolder(accessToken, "대표이미지", dateFolderId);
      const classFolderId = await findOrCreateDriveFolder(accessToken, clsStr, imageFolderId);
      const driveFile = await uploadImageToDrive(accessToken, classFolderId, filename, resizedBuffer);

      return NextResponse.json({
        imageUrl: driveFile.imageUrl,
        driveFileId: driveFile.fileId,
        webViewLink: driveFile.webViewLink,
      });
    } catch (driveError: any) {
      console.error("Google Drive upload failed:", driveError);
      if (isProduction) {
        return NextResponse.json(
          { error: driveError.message || "구글 드라이브 이미지 업로드 실패" },
          { status: 500 }
        );
      }
    }

    // 4. Fallback: Save to local public/uploads directory (for local dev only)
    const uploadsDir = path.join(process.cwd(), "public", "uploads", dateStr, "대표이미지", clsStr);
    await fs.mkdir(uploadsDir, { recursive: true });

    const localPath = path.join(uploadsDir, filename);
    await fs.writeFile(localPath, resizedBuffer);

    // Return local URL path
    const localUrl = `/uploads/${dateStr}/대표이미지/${clsStr}/${filename}`;
    return NextResponse.json({ imageUrl: localUrl });
  } catch (error: any) {
    console.error("Image upload route error:", error);
    return NextResponse.json({ error: error.message || "파일 업로드 실패" }, { status: 500 });
  }
}
