import { Client } from "@notionhq/client";

// Initialize Notion Client
const token = process.env.NOTION_TOKEN;
const dbStudents = process.env.NOTION_DB_STUDENTS;
const dbSessions = process.env.NOTION_DB_SESSIONS;
const dbEvaluations = process.env.NOTION_DB_EVALUATIONS;

const notion = token ? new Client({ auth: token }) : null;

// Helper to check if Notion is configured
export function isNotionConfigured(): boolean {
  return !!(notion && dbStudents && dbSessions && dbEvaluations);
}

// Interfaces
export interface Student {
  id: string;
  name: string;
  cls: "1분반" | "2분반";
  order: number;
}

export interface Session {
  id: string;
  sessionName: string;
  date: string;
  overall: string;
  description: string;
}

export interface Evaluation {
  pageId: string;
  studentPageId: string;
  sessionPageId: string;
  professor: string;
  score: number;
  critic: string;
  date: string;
  imageUrl?: string;
  notionUrl?: string;
}

// Fallback Mock Data for safe boot if env vars are missing
const mockStudents: Student[] = [
  { id: "u1", name: "강민우", cls: "1분반", order: 1 },
  { id: "u2", name: "김민우", cls: "1분반", order: 2 },
  { id: "u3", name: "박승민", cls: "1분반", order: 3 },
  { id: "u4", name: "이찬", cls: "1분반", order: 4 },
  { id: "u5", name: "정영기", cls: "1분반", order: 5 },
];

const mockSessions: Session[] = [
  {
    id: "s1",
    sessionName: "[Mock] 0522 대안발전 : 스케치업, 형태 매스스터디",
    date: "2026-05-22",
    overall: "서버가 아직 연동되지 않았습니다. .env.local 설정을 완료해 주세요.",
    description: "테스트용 세션 설명입니다.",
  },
];

// Helper to extract plain text from Notion rich text properties
function getRichTextPlain(property: any): string {
  if (!property || property.type !== "rich_text") return "";
  return property.rich_text.map((t: any) => t.plain_text).join("");
}

// Fetch all students from DB1
export async function fetchStudents(): Promise<Student[]> {
  if (!isNotionConfigured() || !notion || !dbStudents) {
    console.warn("Notion is not configured. Returning mock students.");
    return mockStudents;
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbStudents,
      sorts: [
        { property: "분반", direction: "ascending" },
        { property: "순번", direction: "ascending" },
      ],
    });

    return response.results.map((page: any) => {
      const name = page.properties["학생명"]?.title?.[0]?.plain_text || "이름 없음";
      const cls = page.properties["분반"]?.select?.name || "1분반";
      const order = page.properties["순번"]?.number || 0;
      return {
        id: page.id,
        name,
        cls: cls as "1분반" | "2분반",
        order,
      };
    });
  } catch (error) {
    console.error("Error fetching students from Notion:", error);
    return mockStudents;
  }
}

// Fetch all sessions from DB2
export async function fetchSessions(): Promise<Session[]> {
  if (!isNotionConfigured() || !notion || !dbSessions) {
    console.warn("Notion is not configured. Returning mock sessions.");
    return mockSessions;
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbSessions,
      sorts: [{ property: "날짜", direction: "descending" }],
    });

    return response.results.map((page: any) => {
      const sessionName = page.properties["세션명"]?.title?.[0]?.plain_text || "세션명 없음";
      const date = page.properties["날짜"]?.date?.start || "";
      const overall = getRichTextPlain(page.properties["총평"]);
      const description = getRichTextPlain(page.properties["과제설명"]);
      return {
        id: page.id,
        sessionName,
        date,
        overall,
        description,
      };
    });
  } catch (error) {
    console.error("Error fetching sessions from Notion:", error);
    return mockSessions;
  }
}

// Fetch evaluations for a specific session from DB3
export async function fetchEvaluationsBySession(sessionId: string): Promise<Record<string, Evaluation>> {
  const result: Record<string, Evaluation> = {};
  if (!isNotionConfigured() || !notion || !dbEvaluations) {
    return result;
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbEvaluations,
      filter: {
        property: "세션",
        relation: {
          contains: sessionId,
        },
      },
    });

    response.results.forEach((page: any) => {
      const studentRelation = page.properties["학생명"]?.relation?.[0]?.id;
      if (!studentRelation) return;

      const professor = page.properties["교수명"]?.select?.name || "";
      const score = page.properties["평가점수"]?.number || 0;
      const critic = getRichTextPlain(page.properties["개별크리틱"]);
      const date = page.properties["평가일시"]?.date?.start || "";
      
      // Extract image URL
      let imageUrl = page.properties["이미지URL"]?.rich_text?.[0]?.plain_text || "";
      if (!imageUrl && page.properties["과제물이미지"]?.files?.length > 0) {
        const fileObj = page.properties["과제물이미지"].files[0];
        imageUrl = fileObj.type === "external" ? fileObj.external.url : fileObj.file?.url || "";
      }

      result[studentRelation] = {
        pageId: page.id,
        studentPageId: studentRelation,
        sessionPageId: sessionId,
        professor,
        score,
        critic,
        date,
        imageUrl,
        notionUrl: page.url,
      };
    });

    return result;
  } catch (error) {
    console.error(`Error fetching evaluations for session ${sessionId}:`, error);
    return result;
  }
}

// Fetch all evaluation logs for a specific student from DB3
export async function fetchStudentEvaluations(studentId: string): Promise<Evaluation[]> {
  if (!isNotionConfigured() || !notion || !dbEvaluations) {
    return [];
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbEvaluations,
      filter: {
        property: "학생명",
        relation: {
          contains: studentId,
        },
      },
      sorts: [
        {
          property: "평가일시",
          direction: "ascending",
        },
      ],
    });

    return response.results.map((page: any) => {
      const sessionRelation = page.properties["세션"]?.relation?.[0]?.id || "";
      const professor = page.properties["교수명"]?.select?.name || "";
      const score = page.properties["평가점수"]?.number || 0;
      const critic = getRichTextPlain(page.properties["개별크리틱"]);
      const date = page.properties["평가일시"]?.date?.start || "";

      let imageUrl = page.properties["이미지URL"]?.rich_text?.[0]?.plain_text || "";
      if (!imageUrl && page.properties["과제물이미지"]?.files?.length > 0) {
        const fileObj = page.properties["과제물이미지"].files[0];
        imageUrl = fileObj.type === "external" ? fileObj.external.url : fileObj.file?.url || "";
      }

      return {
        pageId: page.id,
        studentPageId: studentId,
        sessionPageId: sessionRelation,
        professor,
        score,
        critic,
        date,
        imageUrl,
        notionUrl: page.url,
      };
    });
  } catch (error) {
    console.error(`Error fetching evaluations for student ${studentId}:`, error);
    return [];
  }
}

// Save or Update an Evaluation record in DB3
export async function saveEvaluation(params: {
  studentPageId: string;
  studentName: string;
  sessionPageId: string;
  sessionName: string;
  professor: string;
  score: number;
  critic: string;
  imageUrl?: string;
}): Promise<Evaluation> {
  if (!isNotionConfigured() || !notion || !dbEvaluations) {
    throw new Error("Notion is not configured.");
  }

  const { studentPageId, studentName, sessionPageId, sessionName, professor, score, critic, imageUrl } = params;
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const pageTitle = `${studentName} - ${sessionName.substring(0, 30)}`;

  try {
    // 1. Check if record already exists for this student and session
    const existing = await notion.dataSources.query({
      data_source_id: dbEvaluations,
      filter: {
        and: [
          { property: "학생명", relation: { contains: studentPageId } },
          { property: "세션", relation: { contains: sessionPageId } },
        ],
      },
    });

    const properties: any = {
      "평가기록": {
        title: [{ text: { content: pageTitle } }],
      },
      "학생명": {
        relation: [{ id: studentPageId }],
      },
      "세션": {
        relation: [{ id: sessionPageId }],
      },
      "교수명": {
        select: { name: professor },
      },
      "평가점수": {
        number: score,
      },
      "개별크리틱": {
        rich_text: [{ text: { content: critic } }],
      },
      "평가일시": {
        date: { start: dateStr },
      },
    };

    if (imageUrl) {
      properties["이미지URL"] = {
        rich_text: [{ text: { content: imageUrl } }],
      };
      properties["과제물이미지"] = {
        files: [
          {
            name: "uploaded_work.jpg",
            type: "external",
            external: { url: imageUrl },
          },
        ],
      };
    }

    let pageId = "";
    let notionUrl = "";

    if (existing.results.length > 0) {
      // Update existing page
      const page = existing.results[0];
      pageId = page.id;
      const res = await notion.pages.update({
        page_id: pageId,
        properties,
      });
      notionUrl = (res as any).url;
    } else {
      // Create new page
      const res = await notion.pages.create({
        parent: { database_id: dbEvaluations },
        properties,
      });
      pageId = res.id;
      notionUrl = (res as any).url;
    }

    return {
      pageId,
      studentPageId,
      sessionPageId,
      professor,
      score,
      critic,
      date: dateStr,
      imageUrl,
      notionUrl,
    };
  } catch (error) {
    console.error("Error saving evaluation to Notion:", error);
    throw error;
  }
}

// Update Overall Session review in DB2
export async function saveOverall(params: { sessionPageId: string; overall: string }): Promise<void> {
  if (!isNotionConfigured() || !notion) {
    throw new Error("Notion is not configured.");
  }

  const { sessionPageId, overall } = params;

  try {
    await notion.pages.update({
      page_id: sessionPageId,
      properties: {
        "총평": {
          rich_text: [{ text: { content: overall } }],
        },
      },
    });
  } catch (error) {
    console.error(`Error saving overall review for session ${sessionPageId}:`, error);
    throw error;
  }
}

// Inline update for an evaluation in DB3 (scl.tsx quick-edit)
export async function updateEvaluation(params: { pageId: string; score: number; critic: string }): Promise<void> {
  if (!isNotionConfigured() || !notion) {
    throw new Error("Notion is not configured.");
  }

  const { pageId, score, critic } = params;

  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        "평가점수": {
          number: score,
        },
        "개별크리틱": {
          rich_text: [{ text: { content: critic } }],
        },
      },
    });
  } catch (error) {
    console.error(`Error updating evaluation ${pageId}:`, error);
    throw error;
  }
}

// Fetch student AI advice from DB4
export async function fetchStudentAdvice(studentId: string): Promise<{ pageId: string; date: string; advice: string } | null> {
  const dbAdvice = process.env.NOTION_DB_ADVICE;
  if (!notion || !dbAdvice) {
    console.warn("Notion Client or DB4 ID is missing.");
    return null;
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbAdvice,
      filter: {
        property: "학생명",
        relation: {
          contains: studentId,
        },
      },
      sorts: [
        {
          property: "날짜",
          direction: "descending",
        },
      ],
      page_size: 1,
    });

    if (response.results.length === 0) return null;

    const page: any = response.results[0];
    const advice = getRichTextPlain(page.properties["AI 조언"]);
    const date = page.properties["날짜"]?.date?.start || "";

    return {
      pageId: page.id,
      date,
      advice,
    };
  } catch (error) {
    console.error(`Error fetching AI advice for student ${studentId}:`, error);
    return null;
  }
}

// Save or Update AI advice in DB4
export async function saveStudentAdvice(params: {
  studentId: string;
  studentName: string;
  date: string;
  advice: string;
}): Promise<void> {
  const dbAdvice = process.env.NOTION_DB_ADVICE;
  if (!notion || !dbAdvice) {
    throw new Error("Notion Client or DB4 ID is missing.");
  }

  const { studentId, studentName, date, advice } = params;
  const pageTitle = `${studentName} - ${date}`;

  try {
    // Check if advice already exists for this student and date
    const existing = await notion.dataSources.query({
      data_source_id: dbAdvice,
      filter: {
        and: [
          { property: "학생명", relation: { contains: studentId } },
          { property: "날짜", date: { equals: date } },
        ],
      },
    });

    const properties: any = {
      "이름": {
        title: [{ text: { content: pageTitle } }],
      },
      "날짜": {
        date: { start: date },
      },
      "학생명": {
        relation: [{ id: studentId }],
      },
      "AI 조언": {
        rich_text: [{ text: { content: advice } }],
      },
    };

    if (existing.results.length > 0) {
      // Update existing page
      const pageId = existing.results[0].id;
      await notion.pages.update({
        page_id: pageId,
        properties,
      });
    } else {
      // Create new page
      await notion.pages.create({
        parent: { database_id: dbAdvice },
        properties,
      });
    }
  } catch (error) {
    console.error("Error saving AI advice to Notion DB4:", error);
    throw error;
  }
}

// -------------------------------------------------------------
// Professor Management & Access Control Functions (White-list & Division authorization)
// -------------------------------------------------------------

export interface Professor {
  id?: string;
  name: string;
  email: string;
  classes: ("1분반" | "2분반")[];
}

// Fetch all registered professors from Notion DB5 or environment variables fallback
export async function fetchProfessors(): Promise<Professor[]> {
  const dbProfessors = process.env.NOTION_DB_PROFESSORS;
  
  // 1. Fallback from environment variables if defined
  const envProfessorsStr = process.env.ALLOWED_PROFESSORS;
  let fallbackProfessors: Professor[] = [];
  if (envProfessorsStr) {
    try {
      fallbackProfessors = JSON.parse(envProfessorsStr);
    } catch (e) {
      // If not JSON format, treat as simple comma-separated emails and assign both classes
      const emails = envProfessorsStr.split(",").map(e => e.trim());
      fallbackProfessors = emails.map(email => ({
        name: email.split("@")[0],
        email,
        classes: ["1분반", "2분반"]
      }));
    }
  }

  // If Notion is not setup or DB5 ID is missing, return fallback
  if (!notion || !dbProfessors) {
    return fallbackProfessors;
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbProfessors,
    });

    const notionProfessors = response.results.map((page: any) => {
      const name = page.properties["이름"]?.title?.[0]?.plain_text || "이름 없음";
      const email = getRichTextPlain(page.properties["이메일"]) || page.properties["이메일"]?.email || "";
      const classesSelect = page.properties["담당분반"]?.multi_select || [];
      const classes = classesSelect.map((s: any) => s.name as "1분반" | "2분반");
      
      return {
        id: page.id,
        name,
        email,
        classes,
      };
    });

    // Merge both lists, avoiding duplicate emails
    const merged: Professor[] = [...notionProfessors];
    fallbackProfessors.forEach(fp => {
      if (!merged.some(mp => mp.email.toLowerCase() === fp.email.toLowerCase())) {
        merged.push(fp);
      }
    });

    return merged;
  } catch (error) {
    console.error("Error fetching professors from Notion DB:", error);
    return fallbackProfessors;
  }
}

// Add a new professor to Notion DB5
export async function registerProfessor(name: string, email: string, classes: ("1분반" | "2분반")[]): Promise<Professor | null> {
  const dbProfessors = process.env.NOTION_DB_PROFESSORS;
  if (!notion || !dbProfessors) {
    console.warn("Notion is not configured for registering professors. Falling back to memory/environment.");
    return null;
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: dbProfessors },
      properties: {
        "이름": {
          title: [{ text: { content: name } }],
        },
        "이메일": {
          rich_text: [{ text: { content: email } }],
        },
        "담당분반": {
          multi_select: classes.map(c => ({ name: c })),
        }
      }
    });

    return {
      id: response.id,
      name,
      email,
      classes
    };
  } catch (error) {
    console.error("Error registering professor in Notion:", error);
    throw error;
  }
}

// Check if a professor has permission to modify data
export async function verifyProfessorPermission(
  sessionEmail: string | undefined | null,
  studentPageId?: string
): Promise<{ allowed: boolean; professorName?: string; error?: string }> {
  if (!sessionEmail) {
    return { allowed: false, error: "구글 로그인이 필요합니다." };
  }

  const professors = await fetchProfessors();
  const matchedProf = professors.find(p => p.email.toLowerCase() === sessionEmail.toLowerCase());
  
  if (!matchedProf) {
    return { allowed: false, error: "등록되지 않은 교수 계정입니다. 교수 등록을 완료해 주세요." };
  }

  return { allowed: true, professorName: matchedProf.name };
}

// Helper to verify permission on an existing evaluation page
export async function verifyProfessorPermissionByEvaluation(
  sessionEmail: string | undefined | null,
  evaluationPageId: string
): Promise<{ allowed: boolean; error?: string }> {
  if (!sessionEmail) {
    return { allowed: false, error: "구글 로그인이 필요합니다." };
  }
  if (!notion) {
    return { allowed: false, error: "Notion 클라이언트가 비활성화 상태입니다." };
  }

  try {
    const page: any = await notion.pages.retrieve({ page_id: evaluationPageId });
    const studentRelation = page.properties["학생명"]?.relation?.[0]?.id;
    if (!studentRelation) {
      return { allowed: false, error: "평가 기록에 연동된 학생 정보를 찾을 수 없습니다." };
    }

    return await verifyProfessorPermission(sessionEmail, studentRelation);
  } catch (error) {
    console.error("Error retrieving evaluation page properties:", error);
    return { allowed: false, error: "평가 페이지 조회 실패" };
  }
}

// Add a new session to Notion DB2
export async function createSession(sessionName: string, date: string, description: string = ""): Promise<Session | null> {
  const dbSessions = process.env.NOTION_DB_SESSIONS;
  if (!notion || !dbSessions) {
    console.warn("Notion is not configured for creating sessions.");
    return null;
  }

  try {
    const response = await notion.pages.create({
      parent: { database_id: dbSessions },
      properties: {
        "세션명": {
          title: [{ text: { content: sessionName } }],
        },
        "날짜": {
          date: { start: date },
        },
        "과제설명": {
          rich_text: [{ text: { content: description } }],
        },
      },
    });

    return {
      id: response.id,
      sessionName,
      date,
      overall: "",
      description,
    };
  } catch (error) {
    console.error("Error creating session in Notion:", error);
    throw error;
  }
}




