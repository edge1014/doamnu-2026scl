import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  fetchSessions,
  fetchStudents,
  fetchEvaluationsBySession,
  generateNotionPage,
  verifyProfessorPermission,
} from "@/lib/notion";
import { isReadOnlySemester, normalizeSemester } from "@/lib/semester";
import { combineEvaluationsForSessionDate } from "@/lib/session-progress";

export async function POST(req: NextRequest) {
  // 1. 인증 확인 (교수 로그인 필요)
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const perm = await verifyProfessorPermission(session.user.email);
  if (!perm.allowed) {
    return NextResponse.json({ error: perm.error }, { status: 403 });
  }

  // 2. 요청 본문에서 sessionId 추출
  const body = await req.json();
  const { sessionId } = body;
  const semester = normalizeSemester(body.semester);

  if (isReadOnlySemester(semester)) {
    return NextResponse.json({ error: "1학기는 조회 전용입니다." }, { status: 403 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  }

  try {
    // 3. 세션 정보 조회 (DB2)
    const sessions = await fetchSessions(semester);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetSession.date.slice(0, 10))) {
      return NextResponse.json({ error: "세션의 수업 날짜가 올바르지 않습니다." }, { status: 400 });
    }

    // 평가 입력일이 아닌 수업 날짜를 기준으로 두 분반을 한 일지에 묶는다.
    const daySessions = sessions.filter((item) => item.date.slice(0, 10) === targetSession.date.slice(0, 10));
    const orderedSessions = [targetSession, ...daySessions.filter((item) => item.id !== targetSession.id)];
    const [students, ...evaluationMaps] = await Promise.all([
      fetchStudents(semester),
      ...orderedSessions.map((item) => fetchEvaluationsBySession(item.id, semester)),
    ]);
    const evaluations = combineEvaluationsForSessionDate(
      targetSession.id,
      orderedSessions.map((item, index) => ({ session: item, evaluations: evaluationMaps[index] })),
      students,
      semester === "2026-2"
    );

    const result = await generateNotionPage({
      semester,
      date: targetSession.date.slice(0, 10),
      sessions: daySessions,
      students,
      evaluations,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      message: `${targetSession.date.slice(0, 10)} 수업 일지가 학기 페이지에 생성·갱신되었습니다.`,
    });
  } catch (error: any) {
    console.error("Notion page generation error:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
