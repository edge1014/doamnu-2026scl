type Division = "1분반" | "2분반" | "";

interface SessionEvaluations<T> {
  session: { id: string; date: string; division: Division };
  evaluations: Record<string, T>;
}

export function combineEvaluationsForSessionDate<T>(
  selectedSessionId: string,
  results: SessionEvaluations<T>[],
  students: Array<{ id: string; cls: "1분반" | "2분반" }>,
  divisionScoped: boolean
): Record<string, T> {
  const selectedDate = results.find(({ session }) => session.id === selectedSessionId)?.session.date;
  if (!selectedDate) return {};

  const studentClasses = new Map(students.map((student) => [student.id, student.cls]));
  const combined: Record<string, T> = {};
  for (const { session, evaluations } of results) {
    if (session.date !== selectedDate) continue;
    for (const [studentId, evaluation] of Object.entries(evaluations)) {
      const studentClass = studentClasses.get(studentId);
      if (!studentClass || (divisionScoped && session.division && studentClass !== session.division)) continue;
      combined[studentId] ||= evaluation;
    }
  }
  return combined;
}
