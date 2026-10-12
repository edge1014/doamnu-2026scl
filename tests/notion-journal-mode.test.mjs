import assert from "node:assert/strict";
import test from "node:test";
import { resolveJournalLayout } from "../src/lib/notion-journal-mode.ts";

const students = [
  { id: "a", cls: "1분반" },
  { id: "b", cls: "2분반" },
];
const sessions = [{ division: "1분반" }, { division: "2분반" }];

test("combines classes when an actual evaluating professor overlaps", () => {
  assert.equal(resolveJournalLayout("auto", sessions, students, {
    a: { professor: "김태훈" }, b: { professor: "김태훈" },
  }), "combined");
});

test("separates classes with distinct professors", () => {
  assert.equal(resolveJournalLayout("auto", sessions, students, {
    a: { professor: "김태훈" }, b: { professor: "정미연" },
  }), "separate");
});

test("manual choice works before both classes have evaluations", () => {
  assert.equal(resolveJournalLayout("auto", sessions, students, {}), "undetermined");
  assert.equal(resolveJournalLayout("combined", sessions, students, {}), "combined");
});

test("a shared session record stays combined", () => {
  assert.equal(resolveJournalLayout("auto", [{ division: "" }], students, {}), "combined");
});

test("one class session creates only that class page", () => {
  assert.equal(resolveJournalLayout("auto", [{ division: "2분반" }], students, {}), "separate");
});

test("an overlap remains combined when another professor also evaluates one class", () => {
  assert.equal(resolveJournalLayout("auto", sessions, [...students, { id: "c", cls: "2분반" }], {
    a: { professor: "김태훈" }, b: { professor: "정미연" }, c: { professor: "김태훈" },
  }), "combined");
});
