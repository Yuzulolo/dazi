import { TRAVEL_INTERESTS, labelOf } from "../profile/options.ts";
import { daysBetween } from "../posts/card.ts";

// Rule-based reason, used when the AI is unavailable or the quota is used up.
// Shown without the AI badge ("Suggested match"). No imports from app code, so
// `npm test` can load it (lib/matching/fallback-reason.test.mjs).
export function fallbackReason(m: {
  sharedInterests: string[];
  overlapStart: string;
  overlapEnd: string;
  city: string;
}) {
  const days = daysBetween(m.overlapStart, m.overlapEnd) + 1;
  const when = `${days} shared ${days === 1 ? "day" : "days"} in ${m.city}`;
  const labels = [...new Set(m.sharedInterests)].slice(0, 2).map((v) => labelOf(TRAVEL_INTERESTS, v));
  if (labels.length === 0) return `${when}.`;
  return `You both like ${labels.join(" and ")} · ${when}.`;
}
