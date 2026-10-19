// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { sharedPlanInterests, upcomingOverlap } from "./overlap.ts";

test("shared days never start before today", () => {
  assert.deepEqual(upcomingOverlap("2026-10-17", "2026-10-22", "2026-10-19"), ["2026-10-19", "2026-10-22"]);
  assert.deepEqual(upcomingOverlap("2026-10-21", "2026-10-22", "2026-10-19"), ["2026-10-21", "2026-10-22"]);
});

test("shared interests compare plan with plan", () => {
  assert.deepEqual(sharedPlanInterests(["food_markets", "cafes"], ["cafes", "nightlife_bars"]), ["cafes"]);
  assert.deepEqual(sharedPlanInterests(["museums_galleries"], ["nightlife_bars"]), []);
});
