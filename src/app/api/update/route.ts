import { NextRequest, NextResponse } from "next/server";
import { updateEvaluation, verifyProfessorPermissionByEvaluation } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(req: NextRequest) {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { pageId, score, critic } = body;

    if (!pageId || score === undefined || critic === undefined) {
      return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
    }

    // 1. Verify Access Permission on this evaluation record
    const perm = await verifyProfessorPermissionByEvaluation(sessionEmail, pageId);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    await updateEvaluation({
      pageId,
      score: parseFloat(score),
      critic,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in update api route:", error);
    return NextResponse.json({ error: error.message || "평가 수정 실패" }, { status: 500 });
  }
}
