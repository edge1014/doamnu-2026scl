import type { SemesterKey } from "@/lib/semester";

export function sessionFolderName(date: string, name: string): string {
  const datePrefix = date.slice(5, 7) + date.slice(8, 10);
  const title = name.trim().replace(/^\d{4}\s+/, "").trim();
  if (!title || /[\\/\r\n]/.test(title)) throw new Error("세션명에 사용할 수 없는 문자가 있습니다.");
  return `${datePrefix} ${title}`;
}

export function validateSessionDate(date: string, semester: SemesterKey): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(semester.slice(0, 4))) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
