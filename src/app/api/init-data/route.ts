import { NextRequest, NextResponse } from "next/server";
import { fetchStudents, fetchSessions, fetchProfessors, findDefaultProfessor } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { normalizeSemester } from "@/lib/semester";

export async function GET(req: NextRequest) {
  try {
    const semester = normalizeSemester(req.nextUrl.searchParams.get("semester"));
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const [students, sessions, professors] = await Promise.all([
      fetchStudents(semester),
      fetchSessions(semester),
      fetchProfessors(),
    ]);

    // Find the logged-in professor details
    const normalizedEmail = sessionEmail?.trim().toLowerCase() || "";
    const matchedProf = normalizedEmail 
      ? findDefaultProfessor(normalizedEmail) || professors.find(p => p.email.trim().toLowerCase() === normalizedEmail)
      : null;

    return NextResponse.json({
      students,
      sessions,
      semester,
      // 동일 교수가 Notion과 기본 목록에 함께 있어도 입력폼에는 한 번만 표시한다.
      professors: Array.from(new Set(
        professors.map(p => p.name.trim()).filter(Boolean)
      )),
      authInfo: {
        isRegistered: !!matchedProf,
        name: matchedProf ? matchedProf.name : session?.user?.name || "",
        email: sessionEmail || "",
        classes: matchedProf ? matchedProf.classes : [],
      }
    });
  } catch (error: any) {
    console.error("Error loading init data:", error);
    return NextResponse.json(
      { error: error.message || "초기 데이터 로드 실패" },
      { status: 500 }
    );
  }
}
