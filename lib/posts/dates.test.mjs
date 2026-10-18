// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dateAnchors, nextOccurrence, normalizeTripDates } from "./dates.ts";

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

test("year rule: a trip that already passed this year means next year", () => {
  // "Lisbon 3–5 Oct" written on 17 Oct
  assert.deepEqual(normalizeTripDates("2026-10-03", "2026-10-05", "2026-10-17"), ["2027-10-03", "2027-10-05"]);
});

test("year rule: a trip under way stays this year and starts today", () => {
  // "Berlin 15–20 Oct" written on 17 Oct
  assert.deepEqual(normalizeTripDates("2026-10-15", "2026-10-20", "2026-10-17"), ["2026-10-17", "2026-10-20"]);
  // ...even if the model wrongly pushed it to next year
  assert.deepEqual(normalizeTripDates("2027-10-15", "2027-10-20", "2026-10-17"), ["2026-10-17", "2026-10-20"]);
});

test("year rule: future dates are kept as they are", () => {
  assert.deepEqual(normalizeTripDates("2026-10-20", "2026-10-25", "2026-10-17"), ["2026-10-20", "2026-10-25"]);
  assert.deepEqual(normalizeTripDates("2026-10-17", "2026-10-17", "2026-10-17"), ["2026-10-17", "2026-10-17"]);
  assert.deepEqual(normalizeTripDates("2027-03-01", "2027-03-03", "2026-10-17"), ["2027-03-01", "2027-03-03"]);
});

test("year rule: invalid input gives no dates", () => {
  assert.equal(normalizeTripDates("2026-10-25", "2026-10-20", "2026-10-17"), null); // end before start
  assert.equal(normalizeTripDates("2028-02-29", "2028-02-29", "2028-03-05"), null); // 29 Feb 2029 doesn't exist
  assert.equal(normalizeTripDates("2026-13-01", "2026-13-02", "2026-10-17"), null);
});

test("prompt examples never use 29 Feb", () => {
  const a = dateAnchors("2028-03-10"); // 10 days back would be 29 Feb 2028
  assert.notEqual(a.pastExample.date.slice(5), "02-29");
  assert.equal(a.pastExample.date, "2029-02-28");
});
