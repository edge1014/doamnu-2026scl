import { NextRequest, NextResponse } from "next/server";
import { fetchEvaluationsBySession } from "@/lib/notion";
import { normalizeSemester } from "@/lib/semester";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const semester = normalizeSemester(searchParams.get("semester"));

    if (!sessionId) {
      return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    }

    const evals = await fetchEvaluationsBySession(sessionId, semester);
    return NextResponse.json(evals);
  } catch (error: any) {
    console.error("Error fetching session evaluations:", error);
    return NextResponse.json(
      { error: error.message || "평가 목록 로드 실패" },
      { status: 500 }
    );
  }
}
