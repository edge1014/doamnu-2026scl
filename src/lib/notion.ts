import { Client } from "@notionhq/client";
import { DEFAULT_SEMESTER, type SemesterKey } from "@/lib/semester";
import { chooseJournalPlacement } from "@/lib/notion-journal-placement";

// Initialize Notion Client
const token = process.env.NOTION_TOKEN;

const notion = token ? new Client({ auth: token }) : null;

function getSemesterDatabases(semester: SemesterKey = DEFAULT_SEMESTER) {
  if (semester === "2026-1") {
    return {
      students: process.env.NOTION_DB_STUDENTS_2026_1 || process.env.NOTION_DB_STUDENTS,
      sessions: process.env.NOTION_DB_SESSIONS_2026_1 || process.env.NOTION_DB_SESSIONS,
      evaluations: process.env.NOTION_DB_EVALUATIONS_2026_1 || process.env.NOTION_DB_EVALUATIONS,
      advice: process.env.NOTION_DB_ADVICE_2026_1 || process.env.NOTION_DB_ADVICE,
    };
  }

  return {
    students: process.env.NOTION_DB_STUDENTS_2026_2 || "130e80eb-de5a-48a3-b5ee-4f67bbb91d2e",
    sessions: process.env.NOTION_DB_SESSIONS_2026_2 || "8904bdf3-64b5-4b56-b291-f382fe0a85f5",
    evaluations: process.env.NOTION_DB_EVALUATIONS_2026_2 || "c4a47111-b8cd-4657-84c1-553cf39d8f13",
    advice: process.env.NOTION_DB_ADVICE_2026_2 || "533ce1b8-d003-40b4-8805-0561990e875c",
  };
}

// Helper to check if Notion is configured
export function isNotionConfigured(semester: SemesterKey = DEFAULT_SEMESTER): boolean {
  const databases = getSemesterDatabases(semester);
  return !!(notion && databases.students && databases.sessions && databases.evaluations);
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
  division: "1분반" | "2분반" | "";
  overall: string;
  overallClass1: string;
  overallClass2: string;
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
  imageUploadId?: string;
  notionUrl?: string;
}

export async function uploadEvaluationImage(filename: string, image: Buffer): Promise<string> {
  if (!notion) throw new Error("Notion이 설정되지 않았습니다.");
  const created = await notion.fileUploads.create({
    mode: "single_part",
    filename,
    content_type: "image/jpeg",
  });
  const uploaded = await notion.fileUploads.send({
    file_upload_id: created.id,
    file: { filename, data: new Blob([new Uint8Array(image)], { type: "image/jpeg" }) },
  });
  if (uploaded.status !== "uploaded") throw new Error("Notion 이미지 업로드를 완료하지 못했습니다.");
  return uploaded.id;
}

function getEvaluationImageUrl(page: any): string {
  const fileObj = page.properties["과제물이미지"]?.files?.[0];
  if (fileObj) return fileObj.type === "external" ? fileObj.external.url : fileObj.file?.url || "";
  const legacyUrl = page.properties["이미지URL"]?.rich_text?.[0]?.plain_text || "";
  return legacyUrl.startsWith("https://") ? legacyUrl : "";
}

function getEvaluationImageUploadId(page: any): string | undefined {
  const value = page.properties["이미지URL"]?.rich_text?.[0]?.plain_text || "";
  return value.startsWith("notion-file-upload:") ? value.slice("notion-file-upload:".length) : undefined;
}

// Helper to extract plain text from Notion rich text properties
function getRichTextPlain(property: any): string {
  if (!property || property.type !== "rich_text") return "";
  return property.rich_text.map((t: any) => t.plain_text).join("");
}

// Fetch all students from DB1
export async function fetchStudents(semester: SemesterKey = DEFAULT_SEMESTER): Promise<Student[]> {
  const { students: dbStudents } = getSemesterDatabases(semester);
  if (!isNotionConfigured(semester) || !notion || !dbStudents) {
    console.warn(`Notion student database is not configured for ${semester}.`);
    return [];
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
    return [];
  }
}

// Fetch all sessions from DB2
export async function fetchSessions(semester: SemesterKey = DEFAULT_SEMESTER): Promise<Session[]> {
  const { sessions: dbSessions } = getSemesterDatabases(semester);
  if (!isNotionConfigured(semester) || !notion || !dbSessions) {
    console.warn(`Notion session database is not configured for ${semester}.`);
    return [];
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: dbSessions,
      sorts: [{ property: "날짜", direction: "descending" }],
    });

    return response.results.map((page: any) => {
      const sessionName = page.properties["세션명"]?.title?.[0]?.plain_text || "세션명 없음";
      const date = page.properties["날짜"]?.date?.start || "";
      const division = page.properties["분반"]?.select?.name || "";
      const overall = getRichTextPlain(page.properties["총평"]);
      const overallClass1 = getRichTextPlain(page.properties["1분반 총평"]) || (semester === "2026-1" ? overall : "");
      const overallClass2 = getRichTextPlain(page.properties["2분반 총평"]) || (semester === "2026-1" ? overall : "");
      const description = getRichTextPlain(page.properties["과제설명"]);
      return {
        id: page.id,
        sessionName,
        date,
        division: division as Session["division"],
        overall,
        overallClass1,
        overallClass2,
        description,
      };
    });
  } catch (error) {
    console.error("Error fetching sessions from Notion:", error);
    return [];
  }
}

// Fetch evaluations for a specific session from DB3
export async function fetchEvaluationsBySession(sessionId: string, semester: SemesterKey = DEFAULT_SEMESTER): Promise<Record<string, Evaluation>> {
  const result: Record<string, Evaluation> = {};
  const { evaluations: dbEvaluations } = getSemesterDatabases(semester);
  if (!isNotionConfigured(semester) || !notion || !dbEvaluations) {
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
      const imageUrl = getEvaluationImageUrl(page);

      result[studentRelation] = {
        pageId: page.id,
        studentPageId: studentRelation,
        sessionPageId: sessionId,
        professor,
        score,
        critic,
        date,
        imageUrl,
        imageUploadId: getEvaluationImageUploadId(page),
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
export async function fetchStudentEvaluations(studentId: string, semester: SemesterKey = DEFAULT_SEMESTER): Promise<Evaluation[]> {
  const { evaluations: dbEvaluations } = getSemesterDatabases(semester);
  if (!isNotionConfigured(semester) || !notion || !dbEvaluations) {
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

      const imageUrl = getEvaluationImageUrl(page);

      return {
        pageId: page.id,
        studentPageId: studentId,
        sessionPageId: sessionRelation,
        professor,
        score,
        critic,
        date,
        imageUrl,
        imageUploadId: getEvaluationImageUploadId(page),
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
  semester?: SemesterKey;
  studentPageId: string;
  studentName: string;
  sessionPageId: string;
  sessionName: string;
  professor: string;
  score: number;
  critic: string;
  imageUploadId?: string;
}): Promise<Evaluation> {
  const { evaluations: dbEvaluations } = getSemesterDatabases(params.semester);
  if (!isNotionConfigured(params.semester) || !notion || !dbEvaluations) {
    throw new Error("Notion is not configured.");
  }

  const { studentPageId, studentName, sessionPageId, sessionName, professor, score, critic, imageUploadId } = params;
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

    if (imageUploadId) {
      properties["이미지URL"] = { rich_text: [{ text: { content: `notion-file-upload:${imageUploadId}` } }] };
      properties["과제물이미지"] = {
        files: [{ name: `${studentName}.jpg`, type: "file_upload", file_upload: { id: imageUploadId } }],
      };
    }

    let pageId = "";
    let notionUrl = "";
    let savedPage: any;

    if (existing.results.length > 0) {
      // Update existing page
      const page = existing.results[0];
      pageId = page.id;
      const res = await notion.pages.update({
        page_id: pageId,
        properties,
      });
      notionUrl = (res as any).url;
      savedPage = res;
    } else {
      // Create new page
      const res = await notion.pages.create({
        parent: { data_source_id: dbEvaluations },
        properties,
      });
      pageId = res.id;
      notionUrl = (res as any).url;
      savedPage = res;
    }

    return {
      pageId,
      studentPageId,
      sessionPageId,
      professor,
      score,
      critic,
      date: dateStr,
      imageUrl: getEvaluationImageUrl(savedPage),
      imageUploadId: getEvaluationImageUploadId(savedPage),
      notionUrl,
    };
  } catch (error) {
    console.error("Error saving evaluation to Notion:", error);
    throw error;
  }
}

// Update Overall Session review in DB2
export async function saveOverall(params: { sessionPageId: string; overall: string; division: "1분반" | "2분반"; semester: SemesterKey }): Promise<void> {
  const { sessionPageId, overall, division, semester } = params;
  if (!isNotionConfigured(semester) || !notion) {
    throw new Error("Notion is not configured.");
  }

  const propertyName = semester === "2026-2" ? `${division} 총평` : "총평";

  try {
    await notion.pages.update({
      page_id: sessionPageId,
      properties: {
        [propertyName]: {
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
export async function fetchStudentAdvice(studentId: string, semester: SemesterKey = DEFAULT_SEMESTER): Promise<{ pageId: string; date: string; advice: string } | null> {
  const { advice: dbAdvice } = getSemesterDatabases(semester);
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
  semester?: SemesterKey;
  studentId: string;
  studentName: string;
  date: string;
  advice: string;
}): Promise<void> {
  const { advice: dbAdvice } = getSemesterDatabases(params.semester);
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
        rich_text: buildRichText(advice),
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
        parent: { data_source_id: dbAdvice },
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

const DEFAULT_PROFESSORS: Professor[] = [
  { email: "studiomob@gmail.com", name: "김태훈", classes: ["1분반", "2분반"] },
  { email: "wjdaldus9234@gmail.com", name: "정미연", classes: ["1분반", "2분반"] },
  { email: "haha.sinhae@gmail.com", name: "하신해", classes: ["1분반", "2분반"] },
];

export function findDefaultProfessor(email: string | undefined | null): Professor | null {
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  return DEFAULT_PROFESSORS.find(p => p.email.toLowerCase() === normalizedEmail) || null;
}

// Fetch all registered professors from Notion DB5 or environment variables fallback
export async function fetchProfessors(): Promise<Professor[]> {
  const dbProfessors = process.env.NOTION_DB_PROFESSORS;
  
  // 1. Fallback from environment variables if defined
  const envProfessorsStr = process.env.ALLOWED_PROFESSORS;
  let fallbackProfessors: Professor[] = [...DEFAULT_PROFESSORS];
  if (envProfessorsStr) {
    try {
      const envProfessors = JSON.parse(envProfessorsStr);
      envProfessors.forEach((prof: Professor) => {
        const existing = fallbackProfessors.find(p => p.email.toLowerCase() === prof.email.toLowerCase());
        if (existing) {
          existing.name = prof.name || existing.name;
          existing.classes = Array.from(new Set([...existing.classes, ...(prof.classes || [])])) as ("1분반" | "2분반")[];
        } else {
          fallbackProfessors.push(prof);
        }
      });
    } catch (e) {
      // If not JSON format, treat as simple comma-separated emails and assign both classes
      const emails = envProfessorsStr.split(",").map(e => e.trim());
      emails.map((email): Professor => ({
        name: email.split("@")[0],
        email,
        classes: ["1분반", "2분반"]
      })).forEach((prof) => {
        if (!fallbackProfessors.some(p => p.email.toLowerCase() === prof.email.toLowerCase())) {
          fallbackProfessors.push(prof);
        }
      });
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
      parent: { data_source_id: dbProfessors },
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
export async function createSession(
  sessionName: string,
  date: string,
  description: string = "",
  semester: SemesterKey = DEFAULT_SEMESTER,
  division: "1분반" | "2분반" = "1분반"
): Promise<Session | null> {
  const { sessions: dbSessions } = getSemesterDatabases(semester);
  if (!notion || !dbSessions) {
    console.warn("Notion is not configured for creating sessions.");
    return null;
  }

  try {
    const response = await notion.pages.create({
      parent: { data_source_id: dbSessions },
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
        ...(semester === "2026-2" ? {
          "분반": { select: { name: division } },
        } : {}),
      },
    });

    return {
      id: response.id,
      sessionName,
      date,
      division: semester === "2026-2" ? division : "",
      overall: "",
      overallClass1: "",
      overallClass2: "",
      description,
    };
  } catch (error) {
    console.error("Error creating session in Notion:", error);
    throw error;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Notion 수업 페이지 자동 생성
// ─────────────────────────────────────────────────────────────────────────────

// Normalize image URL to lh3.googleusercontent.com format for Notion compatibility
function normalizeImageUrl(url: string): string {
  if (!url) return "";
  // Already lh3 format
  if (url.startsWith("https://lh3.googleusercontent.com")) return url;
  // GCS public URL format: extract file ID if it's a Notion-served image
  return url;
}

// Build rich_text array for Notion from a plain string (handles length limit)
function buildRichText(text: string) {
  if (!text) return [{ type: "text" as const, text: { content: "" } }];
  // Notion rich_text content is limited to 2000 chars per item
  const chunks: any[] = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: "text", text: { content: text.slice(i, i + 2000) } });
  }
  return chunks;
}

export interface NotionPageInput {
  semester: SemesterKey;
  date: string;
  sessions: Session[];
  students: Student[];
  evaluations: Record<string, Evaluation>; // studentId → Evaluation
}

const JOURNAL_MARKER = "평가폼 자동 생성";
const JOURNAL_TITLES = ["과제", "분반별 총평", "개인별 크리틱 및 평가"];

function getSemesterMainPageId(semester: SemesterKey): string {
  if (semester === "2026-1") {
    return process.env.NOTION_SEMESTER_MAIN_PAGE_2026_1 || "369987c1bf1e80a8a60acdd3c220fa4a";
  }
  return process.env.NOTION_SEMESTER_MAIN_PAGE_2026_2 || "388987c1bf1e808c9813e07ac4e7c441";
}

async function listAllChildBlocks(blockId: string): Promise<any[]> {
  if (!notion) return [];
  const blocks: any[] = [];
  let startCursor: string | undefined;
  do {
    const page = await notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: startCursor });
    blocks.push(...page.results);
    startCursor = page.has_more ? page.next_cursor || undefined : undefined;
  } while (startCursor);
  return blocks;
}

function blockTitle(block: any): string {
  if (block.type === "child_page") return block.child_page?.title || "";
  return (block[block.type]?.rich_text || []).map((item: any) => item.plain_text || item.text?.content || "").join("");
}

async function findOrCreateJournalPage(parentId: string, date: string, sessions: Session[]): Promise<{ id: string; url: string }> {
  if (!notion) throw new Error("Notion이 설정되지 않았습니다.");
  const siblings = await listAllChildBlocks(parentId);
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const placement = chooseJournalPlacement(
    date,
    sessions.map((item) => item.sessionName),
    siblings.filter((block) => block.type === "child_page").map((block) => ({ id: block.id, title: blockTitle(block) }))
  );
  if (placement.existingId) {
    const page: any = await notion.pages.retrieve({ page_id: placement.existingId });
    return { id: placement.existingId, url: page.url };
  }

  // 날짜순으로 이어 붙인다. 관리 데이터베이스 앞에 놓기 위해 직전 날짜 페이지를 기준으로 한다.
  const position = placement.afterBlockId
    ? { type: "after_block" as const, after_block: { id: placement.afterBlockId } }
    : { type: "page_start" as const };
  const page: any = await notion.pages.create({
    parent: { page_id: parentId },
    properties: { title: { title: [{ text: { content: `${mmdd} 수업일지` } }] } },
    position,
  });
  return { id: page.id, url: page.url };
}

export async function generateNotionPage(input: NotionPageInput): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!notion) {
    return { success: false, error: "Notion 클라이언트가 설정되지 않았습니다." };
  }

  const { semester, date, sessions, students, evaluations } = input;

  try {
    const page = await findOrCreateJournalPage(getSemesterMainPageId(semester), date, sessions);
    const existingBlocks = await listAllChildBlocks(page.id);
    const markerText = `${JOURNAL_MARKER} · ${date}`;
    let marker = existingBlocks.find((block) => block.type === "heading_3" && blockTitle(block) === markerText);
    if (!marker) {
      const response = await notion.blocks.children.append({
        block_id: page.id,
        children: [{ object: "block", type: "heading_3", heading_3: { rich_text: buildRichText(markerText) } }],
        position: { type: "start" },
      });
      marker = response.results[0];
    }

    // 재실행 시 자동 생성한 블록만 바꾼다. 페이지의 수기 작성 내용과 관리 DB는 보존한다.
    const currentBlocks = await listAllChildBlocks(page.id);
    const markerIndex = currentBlocks.findIndex((block) => block.id === marker.id);
    const oldGenerated: any[] = [];
    for (const block of currentBlocks.slice(markerIndex + 1)) {
      if (block.type !== "toggle" || !JOURNAL_TITLES.some((title) => blockTitle(block) === title || blockTitle(block).startsWith(`${title} :`))) break;
      oldGenerated.push(block);
    }

    const buildStudentToggle = (st: Student): any => {
      const ev = evaluations[st.id];
      const scoreText = ev ? `${st.name}  ${ev.score}` : `${st.name}  (미평가)`;
      const criticText = ev?.critic || "(크리틱 없음)";
      const imageUrl = ev?.imageUrl ? normalizeImageUrl(ev.imageUrl) : "";

      const innerChildren: any[] = [];

      // 이미지 블록 (URL이 있을 때만)
      if (ev?.imageUploadId) {
        innerChildren.push({
          object: "block",
          type: "image",
          image: { type: "file_upload", file_upload: { id: ev.imageUploadId } },
        });
      } else if (imageUrl && !imageUrl.includes("prod-files-secure.s3") && !imageUrl.includes("notion-static.com")) {
        innerChildren.push({
          object: "block",
          type: "image",
          image: {
            type: "external",
            external: { url: imageUrl },
          },
        });
      }

      // 크리틱 텍스트
      innerChildren.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: buildRichText(criticText),
        },
      });

      return {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: [{ type: "text", text: { content: scoreText } }],
          children: innerChildren,
        },
      };
    };

    const classSessions = (["1분반", "2분반"] as const).map((cls) => ({
      cls,
      session: sessions.find((item) => item.division === cls) || (sessions.length === 1 && !sessions[0].division ? sessions[0] : undefined),
    }));
    const descriptions = classSessions.map(({ cls, session }) => ({ cls, name: session?.sessionName || "", text: session?.description || "" }));
    const sameDescription = descriptions[0].text === descriptions[1].text;
    const assignmentName = sessions.length === 1 ? sessions[0].sessionName : "수업 과제";
    const assignmentChildren: any[] = sameDescription
      ? [{ object: "block", type: "paragraph", paragraph: { rich_text: buildRichText(descriptions[0].text || "(과제 설명 없음)") } }]
      : descriptions.map(({ cls, name, text }) => ({
          object: "block", type: "toggle", toggle: {
            rich_text: buildRichText(`${cls}${name ? ` · ${name}` : ""}`),
            children: [{ object: "block", type: "paragraph", paragraph: { rich_text: buildRichText(text || "(과제 설명 없음)") } }],
          },
        }));

    const blocks: any[] = [
      {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: buildRichText(`과제 : ${assignmentName}`),
          children: assignmentChildren,
        },
      },
      {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: [{ type: "text", text: { content: "분반별 총평" } }],
          children: classSessions.map(({ cls, session }) => ({
            object: "block", type: "toggle", toggle: {
              rich_text: buildRichText(`${cls} 총평${session ? ` · ${session.sessionName}` : ""}`),
              children: [{ object: "block", type: "paragraph", paragraph: {
                rich_text: buildRichText((cls === "1분반" ? session?.overallClass1 : session?.overallClass2) || "(총평 없음)"),
              } }],
            },
          })),
        },
      },
      {
        object: "block",
        type: "toggle",
        toggle: {
          rich_text: [{ type: "text", text: { content: "개인별 크리틱 및 평가" } }],
        },
      },
    ];

    const created = await notion.blocks.children.append({
      block_id: page.id,
      children: blocks,
      position: { type: "after_block", after_block: { id: marker.id } },
    });
    const personalBlock = created.results[2];
    for (const cls of ["1분반", "2분반"] as const) {
      const ordered = students.filter((student) => student.cls === cls).sort((a, b) => a.order - b.order);
      const classBlock = await notion.blocks.children.append({
        block_id: personalBlock.id,
        children: [{ object: "block", type: "toggle", toggle: { rich_text: buildRichText(cls) } }],
      });
      // Notion은 한 요청에 깊게 중첩된 블록을 받지 않으므로 학생별 내용을 분반 토글 아래에 추가한다.
      for (let index = 0; index < ordered.length; index += 100) {
        await notion.blocks.children.append({
          block_id: classBlock.results[0].id,
          children: ordered.slice(index, index + 100).map(buildStudentToggle),
        });
      }
    }
    for (const block of oldGenerated) await notion.blocks.delete({ block_id: block.id });
    return { success: true, url: page.url };
  } catch (error: any) {
    console.error("Error generating Notion page:", error);
    return { success: false, error: error.message || "Notion 페이지 생성 실패" };
  }
}
