import { NextRequest, NextResponse } from "next/server";
import { fetchStudentAdvice, saveStudentAdvice, fetchStudentEvaluations, fetchSessions, fetchStudents, verifyProfessorPermission } from "@/lib/notion";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isReadOnlySemester, normalizeSemester } from "@/lib/semester";

const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const semester = normalizeSemester(searchParams.get("semester"));

    if (!studentId) {
      return NextResponse.json({ error: "학생 ID가 필요합니다." }, { status: 400 });
    }

    const adviceRecord = await fetchStudentAdvice(studentId, semester);

    return NextResponse.json({
      advice: adviceRecord ? adviceRecord.advice : null,
      date: adviceRecord ? adviceRecord.date : null,
    });
  } catch (error: any) {
    console.error("Error in advice api route GET:", error);
    return NextResponse.json({ error: error.message || "AI 조언 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!openRouterApiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY 설정이 누락되었습니다." }, { status: 500 });
    }

    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { studentId } = body;
    const semester = normalizeSemester(body.semester);

    if (!studentId) return NextResponse.json({ error: "학생 ID가 필요합니다." }, { status: 400 });
    if (isReadOnlySemester(semester)) return NextResponse.json({ error: "1학기는 조회 전용입니다." }, { status: 403 });

    // 1. Verify Access Permission & Division Permission
    const perm = await verifyProfessorPermission(sessionEmail, studentId);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const [unsortedEvaluations, sessions, students] = await Promise.all([
      fetchStudentEvaluations(studentId, semester),
      fetchSessions(semester),
      fetchStudents(semester),
    ]);
    const sessionDates = new Map(sessions.map((item) => [item.id, item.date]));
    const evaluations = [...unsortedEvaluations].sort((a, b) =>
      (sessionDates.get(a.sessionPageId) || a.date).localeCompare(sessionDates.get(b.sessionPageId) || b.date)
    );
    const latest = evaluations.at(-1);
    if (!latest) {
      return NextResponse.json({ success: true, advice: null, skipped: "평가 기록이 없어 AI 조언을 생성하지 않았습니다." });
    }
    const student = students.find((item) => item.id === studentId);
    if (!student) return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    const sessionName = sessions.find((item) => item.id === latest.sessionPageId)?.sessionName || "건축설계 수업";
    const studentName = student.name;
    const critic = latest.critic || "(교수 크리틱 내용 없음)";
    const score = latest.score;
    const dateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    const historyEvals = evaluations.slice(0, -1).slice(-4).reverse(); // Current evaluation excluded; up to 4 previous records, latest first

    const historySummary = historyEvals.length > 0
      ? historyEvals.map((e) => `- [${sessionDates.get(e.sessionPageId) || e.date}] 점수: ${e.score}점, 크리틱: ${e.critic}`).join("\n")
      : "(이전 평가 기록 없음)";

    const prompt = `
너는 대학교 건축설계 과목의 친근하고 전문적인 AI 튜터 '젠지(Gen-Z)'야. 요즘 대학생들이 쓰는 트렌디한 표현(예: 폼 미쳤다, 찢었다, 가보자고, 에바임)을 맛깔나게 섞고 이모지도 활용해. 동시에 건축설계 개념과 공간 질서에 대해 날카롭고 구체적인 조언을 해줘.

[중요 분석 지침]
1. 가장 최근 수업의 크리틱과 점수에 50~60%의 비중을 둬. 이번 평가에서 확인된 강점과 다음에 고칠 점을 구체적으로 짚어줘.
2. 직전 3~4회 크리틱과 점수 흐름을 참고해. 반복되는 문제나 실제로 개선된 점이 있을 때만 언급해줘.
3. 기록에 없는 설계 요소, 교수의 숨은 의도, 학생의 노력이나 성향을 사실처럼 추측하지 마. 크리틱이 비어 있으면 점수만으로 원인을 단정하지 말고 이전 기록에 근거한 다음 작업을 제안해줘.

학생 정보:
- 이름: ${studentName}
- 수업 세션명: ${sessionName}
- 최근 수업 날짜: ${sessionDates.get(latest.sessionPageId) || latest.date}
- 최근 교수 평가 점수: ${score} / 10점
- 최근 담당 교수 크리틱 내용:
"${critic}"

이전 크리틱 이력 (최근 순):
${historySummary}

[출력 형식과 분량]
전체를 공백 포함 약 350~450자, 최대 500자로 작성해줘. 검증용 장문 조언의 약 절반 분량이 목표야. 젠지 말투와 이모지는 유지하되 같은 표현을 반복하며 길게 늘이지 마.

✅ 현재 상황 진단: 최근 평가를 중심으로 이전 기록과의 변화까지 1~2문장으로 짚어줘.
⚠️ 젠지의 조언: 기록에서 중요한 개선 과제만 골라 1~3개 제안해줘. 조언 개수를 채우려고 근거 없는 항목을 만들지 마. 각 조언에는 학생이 도면, 단면, 모형, 스케치업 등에서 무엇을 시험하거나 보여줄지 넣어줘.
마지막에는 ${studentName}에게 젠지 말투의 짧은 격려 한 문장을 써줘.

제목 외의 마크다운 기호(**, #)는 쓰지 말고 줄바꿈으로 읽기 쉽게 구분해줘.
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
      },
      body: JSON.stringify({
        model: openRouterModel,
        max_tokens: 800,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API 호출 실패: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const adviceText = (data?.choices?.[0]?.message?.content || "").trim();

    if (!adviceText) {
      throw new Error("AI 조언 생성 결과가 비어있습니다.");
    }

    // Save to Notion DB4
    await saveStudentAdvice({
      semester,
      studentId,
      studentName,
      date: dateStr,
      advice: adviceText,
    });

    return NextResponse.json({
      success: true,
      advice: adviceText,
      date: dateStr,
    });
  } catch (error: any) {
    console.error("Error in advice api route POST:", error);
    return NextResponse.json({ error: error.message || "AI 조언 생성 및 저장 실패" }, { status: 500 });
  }
}
