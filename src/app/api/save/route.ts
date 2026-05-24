import { NextRequest, NextResponse } from "next/server";
import { saveEvaluation, verifyProfessorPermission } from "@/lib/notion";
import { GoogleGenAI } from "@google/genai";
import { saveStudentAdvice } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const geminiApiKey = process.env.GEMINI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { studentPageId, studentName, sessionPageId, sessionName, professor, score, critic, imageUrl } = body;

    if (!studentPageId || !studentName || !sessionPageId || !sessionName || !professor) {
      return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    // 1. Verify Access Permission & Division Permission
    const perm = await verifyProfessorPermission(sessionEmail, studentPageId);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const registeredProfessorName = perm.professorName || professor;

    // 2. Save evaluation to Notion DB3
    const result = await saveEvaluation({
      studentPageId,
      studentName,
      sessionPageId,
      sessionName,
      professor: registeredProfessorName,
      score: parseFloat(score),
      critic,
      imageUrl,
    });

    // Gemini AI advice generation has been removed from save endpoint for token-saving.
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
