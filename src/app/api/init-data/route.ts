import { NextResponse } from "next/server";
import { fetchStudents, fetchSessions, fetchProfessors, findDefaultProfessor } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const [students, sessions, professors] = await Promise.all([
      fetchStudents(),
      fetchSessions(),
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
      professors: professors.map(p => p.name), // Dynamic professor lists for UI select element
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
