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

    // 4. 전체 학생 목록 조회 (DB1)
    const students = await fetchStudents(semester);

    // 5. 해당 세션의 평가 전체 조회 (DB3)
    const evaluations = await fetchEvaluationsBySession(sessionId, semester);

    // 6. Notion 페이지 생성 (기존 블록 삭제 후 재작성)
    const result = await generateNotionPage({
      sessionPageId: sessionId,
      sessionName: targetSession.sessionName,
      description: targetSession.description,
      division: targetSession.division,
      overallClass1: targetSession.overallClass1,
      overallClass2: targetSession.overallClass2,
      students,
      evaluations,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      message: `"${targetSession.sessionName}" Notion 수업 페이지가 생성되었습니다.`,
    });
  } catch (error: any) {
    console.error("Notion page generation error:", error);
    return NextResponse.json(
      { error: error.message || "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
