import assert from "node:assert/strict";
import test from "node:test";
import { combineEvaluationsForSessionDate } from "../src/lib/session-progress.ts";

test("same class date combines differently named division sessions despite different evaluation entry dates", () => {
  const students = [
    { id: "first", cls: "1분반" },
    { id: "second", cls: "2분반" },
  ];
  const results = [
    {
      session: { id: "second-session", date: "2026-09-29", division: "2분반" },
      evaluations: { second: { date: "2026-09-28", score: 8 } },
    },
    {
      session: { id: "first-session", date: "2026-09-29", division: "1분반" },
      evaluations: { first: { date: "2026-10-01", score: 7 } },
    },
    {
      session: { id: "other-date", date: "2026-09-30", division: "1분반" },
      evaluations: { first: { date: "2026-09-30", score: 9 } },
    },
  ];

  const combined = combineEvaluationsForSessionDate("second-session", results, students, true);
  assert.deepEqual(Object.keys(combined).sort(), ["first", "second"]);
  assert.equal(combined.first.score, 7);
  assert.equal(combined.second.score, 8);
});

test("an evaluation in the wrong division session does not count", () => {
  const combined = combineEvaluationsForSessionDate(
    "first-session",
    [{
      session: { id: "first-session", date: "2026-09-29", division: "1분반" },
      evaluations: { second: { score: 8 } },
    }],
    [{ id: "second", cls: "2분반" }],
    true
  );
  assert.deepEqual(combined, {});
});
