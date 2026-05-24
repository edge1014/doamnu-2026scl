import { NextRequest, NextResponse } from "next/server";
import { registerProfessor, fetchProfessors } from "@/lib/notion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, classes, passcode } = body;

    if (!name || !email || !classes || !passcode) {
      return NextResponse.json({ error: "필수 정보(이름, 이메일, 담당 분반, 패스코드)가 누락되었습니다." }, { status: 400 });
    }

    // 1. Verify Passcode
    const expectedPasscode = process.env.PROFESSOR_SIGNUP_CODE || "arch2026";
    if (passcode !== expectedPasscode) {
      return NextResponse.json({ error: "올바르지 않은 가입 승인 패스코드입니다." }, { status: 403 });
    }

    // 2. Check if already registered
    const existingProfessors = await fetchProfessors();
    const isRegistered = existingProfessors.some(
      (p) => p.email.toLowerCase() === email.toLowerCase()
    );

    if (isRegistered) {
      return NextResponse.json({ error: "이미 등록된 교수 계정입니다." }, { status: 400 });
    }

    // 3. Register to Notion DB5
    const dbProfessors = process.env.NOTION_DB_PROFESSORS;
    if (!dbProfessors) {
      return NextResponse.json({
        error: "Notion 교수 데이터베이스 ID가 설정되지 않았습니다. .env.local에 NOTION_DB_PROFESSORS를 추가해 주세요."
      }, { status: 500 });
    }

    const newProf = await registerProfessor(name, email, classes);

    return NextResponse.json({
      success: true,
      professor: newProf,
      message: `${name} 교수님 등록이 완료되었습니다!`
    });
  } catch (error: any) {
    console.error("Error in register-professor api route:", error);
    return NextResponse.json({ error: error.message || "교수 등록 실패" }, { status: 500 });
  }
}
