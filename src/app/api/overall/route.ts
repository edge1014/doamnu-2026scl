import { NextRequest, NextResponse } from "next/server";
import { saveOverall, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isReadOnlySemester, normalizeSemester } from "@/lib/semester";

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { sessionPageId, overall, division } = body;
    const semester = normalizeSemester(body.semester);

    if (isReadOnlySemester(semester)) {
      return NextResponse.json({ error: "1학기는 조회 전용입니다." }, { status: 403 });
    }

    if (!sessionPageId) {
      return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    }

    if (division !== "1분반" && division !== "2분반") {
      return NextResponse.json({ error: "총평 대상 분반이 필요합니다." }, { status: 400 });
    }

    // 1. Verify Access Permission (Any registered professor)
    const perm = await verifyProfessorPermission(sessionEmail);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    await saveOverall({
      sessionPageId,
      overall,
      division,
      semester,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in overall api route:", error);
    return NextResponse.json({ error: error.message || "총평 저장 실패" }, { status: 500 });
  }
}
