import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { saveEvaluation, uploadEvaluationImage, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isReadOnlySemester, normalizeSemester } from "@/lib/semester";

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.formData();
    const studentPageId = String(body.get("studentPageId") || "");
    const studentName = String(body.get("studentName") || "");
    const sessionPageId = String(body.get("sessionPageId") || "");
    const sessionName = String(body.get("sessionName") || "");
    const professor = String(body.get("professor") || "");
    const score = Number(body.get("score"));
    const critic = String(body.get("critic") || "");
    const file = body.get("image");
    const semester = normalizeSemester(body.get("semester"));

    if (isReadOnlySemester(semester)) {
      return NextResponse.json({ error: "1학기는 조회 전용입니다." }, { status: 403 });
    }

    if (!studentPageId || !studentName || !sessionPageId || !sessionName || !professor) {
      return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }
    if (!Number.isFinite(score)) {
      return NextResponse.json({ error: "평가점수가 올바르지 않습니다." }, { status: 400 });
    }
    if (file instanceof File && (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)) {
      return NextResponse.json({ error: "20MB 이하의 이미지 파일을 선택해 주세요." }, { status: 400 });
    }

    // 1. Verify Access Permission & Division Permission
    const perm = await verifyProfessorPermission(sessionEmail, studentPageId);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const registeredProfessorName = perm.professorName || professor;

    let imageUploadId: string | undefined;
    if (file instanceof File) {
      const image = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      imageUploadId = await uploadEvaluationImage(`${studentName}.jpg`, image);
    }

    // 2. Save evaluation to Notion DB3
    const result = await saveEvaluation({
      semester,
      studentPageId,
      studentName,
      sessionPageId,
      sessionName,
      professor: registeredProfessorName,
      score,
      critic,
      imageUploadId,
    });

    // AI advice generation has been removed from save endpoint for token-saving.
    // It will be triggered manually in bulk/individually from the dashboard.

    return NextResponse.json({
      success: true,
      notionUrl: result.notionUrl,
      evaluation: result,
    });
  } catch (error: any) {
    console.error("Error in save api route:", error);
    return NextResponse.json({ error: error.message || "평가 기록 저장 실패" }, { status: 500 });
  }
}
