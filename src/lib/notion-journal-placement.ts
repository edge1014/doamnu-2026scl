export interface JournalSibling {
  id: string;
  title: string;
}

export function chooseJournalPlacement(
  date: string,
  sessionNames: string[],
  siblings: JournalSibling[]
): { existingId?: string; afterBlockId?: string } {
  const mmdd = date.slice(5, 7) + date.slice(8, 10);
  const datePages = siblings.filter((item) => new RegExp(`^${mmdd}(?!\\d)`).test(item.title));
  const nameMatches = datePages.filter((item) => sessionNames.some((name) => item.title.includes(name)));
  const preferred = datePages.find((item) => item.title === `${mmdd} 수업일지`)
    || (nameMatches.length === 1 ? nameMatches[0] : undefined)
    || (datePages.length === 1 ? datePages[0] : undefined);
  if (preferred) return { existingId: preferred.id };
  if (datePages.length > 1) {
    throw new Error(`${mmdd} 날짜의 학기 메인페이지 자식 페이지가 여러 개입니다. 수업일지 대상 페이지를 정할 수 없습니다.`);
  }
  const previous = [...siblings].reverse().find((item) => /^\d{4}(?!\d)/.test(item.title) && item.title.slice(0, 4) < mmdd);
  return { afterBlockId: previous?.id };
}
