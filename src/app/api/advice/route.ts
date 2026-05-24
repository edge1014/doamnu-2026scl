import { NextRequest, NextResponse } from "next/server";
import { fetchStudentAdvice, saveStudentAdvice, fetchStudentEvaluations, verifyProfessorPermission } from "@/lib/notion";
import { GoogleGenAI } from "@google/genai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const geminiApiKey = process.env.GEMINI_API_KEY;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");

    if (!studentId) {
      return NextResponse.json({ error: "학생 ID가 필요합니다." }, { status: 400 });
    }

    const adviceRecord = await fetchStudentAdvice(studentId);
    
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
    if (!geminiApiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY 설정이 누락되었습니다." }, { status: 500 });
    }

    const session: any = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email;

    const body = await req.json();
    const { studentId, studentName, critic, score, sessionName } = body;

    if (!studentId || !studentName || !critic || score === undefined || !sessionName) {
      return NextResponse.json({ error: "필수 요청 데이터가 누락되었습니다." }, { status: 400 });
    }

    // 1. Verify Access Permission & Division Permission
    const perm = await verifyProfessorPermission(sessionEmail, studentId);
    if (!perm.allowed) {
      return NextResponse.json({ error: perm.error }, { status: 403 });
    }

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const dateStr = new Date().toISOString().split("T")[0];

    // 1. Fetch historical evaluations for context
    const evaluations = await fetchStudentEvaluations(studentId);
    const historyEvals = evaluations
      .filter((e) => e.critic !== critic || e.score !== score)
      .slice(-4); // Get up to 4 recent historical records

    const historySummary = historyEvals.length > 0
      ? historyEvals.map((e) => `- [${e.date}] 점수: ${e.score}점, 크리틱: ${e.critic}`).join("\n")
      : "(이전 평가 기록 없음)";

    const prompt = `
너는 대학교 건축설계 과목 수강생들을 지도하는 친근하고 전문적인 AI 튜터이자 어드바이저 '젠지(Gen-Z)'야.
요즘 대학생들이 쓰는 트렌디한 말투(예: 폼 미쳤다, 찢었다, 가보자고, 에바임, ~자고, ~누, ~하네, 각종 이모지 다수 사용)를 맛깔나게 섞어 쓰면서도, 건축설계 개념이나 공간 질서에 대해 대단히 날카롭고 구체적이며 뼈 때리는 조언을 해주어야 해.

[중요 분석 지침]
1. 오늘(그날)의 크리틱 내용(비중 80%): 오늘 전달된 크리틱 내용("${critic}")과 점수(${score}점)를 핵심 대상으로 삼아 구체적이고 현실적인 공간설계 개선점을 피드백해줘.
2. 이전 크리틱 이력 및 흐름(비중 20%): 아래 제공된 이전 3~4회 동안의 크리틱 기록을 바탕으로, 학생의 설계 성장의 흐름, 반복해서 지적받고 있는 문제점, 혹은 개선된 점을 파악하여 조언에 반영해줘.

학생 정보:
- 이름: ${studentName}
- 수업 세션명: ${sessionName}
- 오늘 교수 평가 점수: ${score} / 10점
- 오늘 담당 교수 크리틱 내용:
"${critic}"

이전 크리틱 이력 (최근 순):
${historySummary}

[출력 형식 가이드]
반드시 다음 세 가지 구성을 정확히 포함하고 마크다운 줄바꿈(\\n)을 활용해서 작성해줘.
포맷은 아래 구조를 꼭 지켜야 해:

✅ 현재 상황 진단
(오늘 크리틱을 핵심으로 하되, 이전 크리틱 대비 성장이나 반복되는 문제점 등 흐름을 젠지 감성으로 위트 있게 진단해줘. 약 2~3줄)

⚠️ 젠지(Gen-Z)의 조언
1. [키워드]: (첫 번째 구체적이고 현실적인 공간구성이나 바닥판 설계 조언 제시, 이모지 포함)
2. [키워드]: (두 번째 동선, 보이드 공간, 단면 위계 스터디 관련 조언 제시, 이모지 포함)
3. [키워드]: (세 번째 스케치업 모델링 퀄리티, 재료감, 혹은 외관 마감 스터디 조언 제시, 이모지 포함)

${studentName}아, (마무리 격려 메시지를 젠지 말투로 써줘. 예: 아름아, 지난번에 동선 복잡했던 건 완벽히 해결했는데 이번엔 디테일이 조금 아쉽네! 뼈대만 잘 잡아도 공간이 럭셔리해져! 시그니처 공간 하나 제대로 찢어보자! ✨)
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const adviceText = (response.text || "").trim();

    if (!adviceText) {
      throw new Error("AI 조언 생성 결과가 비어있습니다.");
    }

    // Save to Notion DB4
    await saveStudentAdvice({
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
