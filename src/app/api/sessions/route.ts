import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { sessionName, date, description } = body;

    if (!sessionName || !date) {
      return NextResponse.json({ error: "세션명과 날짜는 필수 입력 사항입니다." }, { status: 400 });
    }

    // Verify Access Permission
    const perm = await verifyProfessorPermission(sessionEmail);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const newSession = await createSession(sessionName, date, description || "");

    if (!newSession) {
      throw new Error("세션이 정상적으로 생성되지 않았습니다.");
    }

    return NextResponse.json({ success: true, session: newSession });
  } catch (error: any) {
    console.error("Error in sessions api route:", error);
    return NextResponse.json({ error: error.message || "수업 세션 생성 실패" }, { status: 500 });
  }
}
