export function isWithinRecentClassDays(classDate: string, reportDate: string, days: number): boolean {
  const classDay = Date.parse(classDate.slice(0, 10));
  const reportDay = Date.parse(reportDate.slice(0, 10));
  if (!Number.isFinite(classDay) || !Number.isFinite(reportDay) || days <= 0) return false;
  const calendarDays = (reportDay - classDay) / 86400000;
  return calendarDays >= 0 && calendarDays < days;
}
