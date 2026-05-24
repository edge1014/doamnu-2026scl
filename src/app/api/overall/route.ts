import { NextRequest, NextResponse } from "next/server";
import { saveOverall, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { sessionPageId, overall } = body;

    if (!sessionPageId) {
      return NextResponse.json({ error: "세션 ID가 필요합니다." }, { status: 400 });
    }

    // 1. Verify Access Permission (Any registered professor)
    const perm = await verifyProfessorPermission(sessionEmail);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    await saveOverall({
      sessionPageId,
      overall,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in overall api route:", error);
    return NextResponse.json({ error: error.message || "총평 저장 실패" }, { status: 500 });
  }
}
