export type JournalMode = "auto" | "combined" | "separate";
export type JournalLayout = Exclude<JournalMode, "auto">;

type Division = "1분반" | "2분반";

export function resolveJournalLayout(
  requested: JournalMode,
  sessions: Array<{ division: Division | "" }>,
  students: Array<{ id: string; cls: Division }>,
  evaluations: Record<string, { professor: string }>
): JournalLayout | "undetermined" {
  if (requested !== "auto") return requested;
  if (sessions.length === 1 && !sessions[0].division) return "combined";
  if (!sessions.some((session) => session.division === "1분반") || !sessions.some((session) => session.division === "2분반")) return "separate";

  const classes = new Map(students.map((student) => [student.id, student.cls]));
  const professors = { "1분반": new Set<string>(), "2분반": new Set<string>() };
  for (const [studentId, evaluation] of Object.entries(evaluations)) {
    const cls = classes.get(studentId);
    const name = evaluation.professor.trim();
    if (cls && name) professors[cls].add(name);
  }

  if ([...professors["1분반"]].some((name) => professors["2분반"].has(name))) {
    return "combined";
  }
  if (professors["1분반"].size === 0 || professors["2분반"].size === 0) return "undetermined";
  return "separate";
}
