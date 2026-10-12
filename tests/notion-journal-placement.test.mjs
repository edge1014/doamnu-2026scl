import assert from "node:assert/strict";
import test from "node:test";
import { chooseJournalPlacement } from "../src/lib/notion-journal-placement.ts";

test("uses the existing 1013 class page and preserves its manually written body", () => {
  const placement = chooseJournalPlacement("2026-10-13", ["1013 두번째 프로젝트 오리엔테이션"], [
    { id: "sept", title: "0915 수업" },
    { id: "intro", title: "1013 두번째 프로젝트 오리엔테이션" },
  ]);
  assert.deepEqual(placement, { existingId: "intro" });
});

test("places a new 0929 journal after the last earlier date", () => {
  const placement = chooseJournalPlacement("2026-09-29", ["0929 계획안 확정", "0929_계획안발전"], [
    { id: "sept", title: "0915 계획안" },
    { id: "oct", title: "1013 두번째 프로젝트 오리엔테이션" },
  ]);
  assert.deepEqual(placement, { afterBlockId: "sept" });
});

test("refuses to choose between two existing pages for the same class date", () => {
  assert.throws(() => chooseJournalPlacement("2026-09-29", ["계획안 확정", "계획안발전"], [
    { id: "first", title: "0929 계획안 확정" },
    { id: "second", title: "0929 계획안발전" },
  ]), /여러 개/);
});
