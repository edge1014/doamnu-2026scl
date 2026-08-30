export const SEMESTERS = ["2026-2", "2026-1"] as const;

export type SemesterKey = (typeof SEMESTERS)[number];

export const DEFAULT_SEMESTER: SemesterKey = "2026-2";

export function normalizeSemester(value: unknown): SemesterKey {
  return value === "2026-1" ? "2026-1" : DEFAULT_SEMESTER;
}

export function isReadOnlySemester(semester: SemesterKey): boolean {
  return semester === "2026-1";
}

