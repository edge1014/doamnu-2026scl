import { NextRequest, NextResponse } from "next/server";
import { fetchEvaluationsBySession } from "@/lib/notion";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    }

    const evals = await fetchEvaluationsBySession(sessionId);
    return NextResponse.json(evals);
  } catch (error: any) {
    console.error("Error fetching session evaluations:", error);
    return NextResponse.json(
      { error: error.message || "평가 목록 로드 실패" },
      { status: 500 }
    );
  }
}
