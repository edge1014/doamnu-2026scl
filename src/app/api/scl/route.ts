import { NextRequest, NextResponse } from "next/server";
import { fetchStudentEvaluations } from "@/lib/notion";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json({ error: "학생 ID가 필요합니다." }, { status: 400 });
    }

    const evaluations = await fetchStudentEvaluations(studentId);
    
    // Map internal fields to match the frontend expectations
    const mapped = evaluations.map((e) => ({
      pageId: e.pageId,
      date: e.date,
      score: e.score,
      critic: e.critic,
      imageUrl: e.imageUrl,
      notionUrl: e.notionUrl,
      sessionPageId: e.sessionPageId,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error("Error in scl fetch api route:", error);
    return NextResponse.json({ error: error.message || "평가 기록 조회 실패" }, { status: 500 });
  }
}
