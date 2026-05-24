import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchProfessors } from "@/lib/notion";

// Initialize GCS client
const bucketName = process.env.GCS_BUCKET_NAME;

const storageConfig: any = {};
if (process.env.GCS_PROJECT_ID) {
  storageConfig.projectId = process.env.GCS_PROJECT_ID;
}
if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
  storageConfig.credentials = {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

const storage = bucketName ? new Storage(storageConfig) : null;

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    if (!sessionEmail) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

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

    // Target key in GCS: 2026-05-24/대표이미지/1분반/01_강민우.jpg
    const targetPath = `${dateStr}/대표이미지/${clsStr}/${filename}`;

    // 3. Upload to GCS if configured
    if (storage && bucketName) {
      try {
        const bucket = storage.bucket(bucketName);
        const gcsFile = bucket.file(targetPath);

        await gcsFile.save(resizedBuffer, {
          metadata: {
            contentType: "image/jpeg",
          },
        });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${targetPath}`;
        return NextResponse.json({ imageUrl: publicUrl });
      } catch (gcsError: any) {
        console.error("GCS upload failed, falling back to local storage:", gcsError);
      }
    }

    // 4. Fallback: Save to local public/uploads directory (for local dev)
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
