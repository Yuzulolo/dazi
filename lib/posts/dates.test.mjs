// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateAnchors, nextOccurrence } from "./dates.ts";

test("Saturday 17 Oct 2026 (the eval's frozen today)", () => {
  const a = dateAnchors("2026-10-17");
  assert.equal(a.tomorrow, "2026-10-18");
  assert.deepEqual(a.thisWeekend, ["2026-10-17", "2026-10-18"]);
  assert.deepEqual(a.nextWeekend, ["2026-10-24", "2026-10-25"]);
  assert.deepEqual(a.nextWeek, ["2026-10-19", "2026-10-25"]);
  assert.deepEqual(a.pastExample, { label: "7 October", date: "2027-10-07" });
  assert.deepEqual(a.futureExample, { label: "27 October", date: "2026-10-27" });
});

test("Wednesday: weekend is the coming Sat–Sun, next week starts Monday", () => {
  const a = dateAnchors("2026-10-14");
  assert.deepEqual(a.thisWeekend, ["2026-10-17", "2026-10-18"]);
  assert.deepEqual(a.nextWeek, ["2026-10-19", "2026-10-25"]);
});

test("Sunday: this weekend is today only; next week is tomorrow–Sunday", () => {
  const a = dateAnchors("2026-10-18");
  assert.deepEqual(a.thisWeekend, ["2026-10-18", "2026-10-18"]);
  assert.deepEqual(a.nextWeekend, ["2026-10-24", "2026-10-25"]);
  assert.deepEqual(a.nextWeek, ["2026-10-19", "2026-10-25"]);
});

test("Monday: next week is the following Monday", () => {
  assert.deepEqual(dateAnchors("2026-10-19").nextWeek, ["2026-10-26", "2026-11-01"]);
});

test("Year boundary", () => {
  const a = dateAnchors("2026-12-30");
  assert.equal(a.tomorrow, "2026-12-31");
  assert.deepEqual(a.nextWeek, ["2027-01-04", "2027-01-10"]);
  assert.equal(nextOccurrence("01-05", "2026-12-30"), "2027-01-05");
  assert.equal(nextOccurrence("12-31", "2026-12-30"), "2026-12-31");
  assert.equal(nextOccurrence("10-03", "2026-10-17"), "2027-10-03");
});
