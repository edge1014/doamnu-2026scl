import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isReadOnlySemester, normalizeSemester } from "@/lib/semester";
import { sessionFolderName, validateSessionDate } from "@/lib/session-name";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { sessionName, date, description, division } = body;
    const semester = normalizeSemester(body.semester);

    if (isReadOnlySemester(semester)) {
      return NextResponse.json({ error: "1학기는 조회 전용입니다." }, { status: 403 });
    }

    if (typeof sessionName !== "string" || !sessionName.trim() || typeof date !== "string" || !date) {
      return NextResponse.json({ error: "세션명과 날짜는 필수 입력 사항입니다." }, { status: 400 });
    }

    if (!validateSessionDate(date, semester)) {
      return NextResponse.json({ error: "수업 날짜가 학기 연도와 맞지 않거나 올바르지 않습니다." }, { status: 400 });
    }

    if (semester === "2026-2" && division !== "1분반" && division !== "2분반") {
      return NextResponse.json({ error: "세션 대상 분반을 선택해주세요." }, { status: 400 });
    }

    // Verify Access Permission
    const perm = await verifyProfessorPermission(sessionEmail);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const datedSessionName = sessionFolderName(date, sessionName);
    const newSession = await createSession(datedSessionName, date, description || "", semester, division);

    if (!newSession) {
      throw new Error("세션이 정상적으로 생성되지 않았습니다.");
    }

    return NextResponse.json({ success: true, session: newSession });
  } catch (error: unknown) {
    console.error("Error in sessions api route:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "수업 세션 생성 실패" }, { status: 500 });
  }
}
