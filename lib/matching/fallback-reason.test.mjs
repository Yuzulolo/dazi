// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackReason } from "./fallback-reason.ts";

test("names up to two shared interests and the shared days", () => {
  assert.equal(
    fallbackReason({ sharedInterests: ["food_markets", "cafes", "shopping"], overlapStart: "2026-10-20", overlapEnd: "2026-10-22", city: "Berlin" }),
    "You both like Food & markets and Cafés · 3 shared days in Berlin.",
  );
});

test("one shared day, no shared interests", () => {
  assert.equal(
    fallbackReason({ sharedInterests: [], overlapStart: "2026-10-20", overlapEnd: "2026-10-20", city: "Berlin" }),
    "1 shared day in Berlin.",
  );
});
