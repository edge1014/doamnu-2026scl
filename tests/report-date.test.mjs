import assert from "node:assert/strict";
import test from "node:test";
import { isWithinRecentClassDays } from "../src/lib/report-date.ts";

test("recent three weeks uses the class date, including the day 20 days before printing", () => {
  assert.equal(isWithinRecentClassDays("2026-09-22", "2026-10-12", 21), true);
  assert.equal(isWithinRecentClassDays("2026-09-21", "2026-10-12", 21), false);
  assert.equal(isWithinRecentClassDays("2026-10-13", "2026-10-12", 21), false);
});
