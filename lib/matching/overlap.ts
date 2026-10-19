// What two plans really have in common, as shown to the user (no imports from app code,
// so `npm test` can load it).

// Shared days, starting today at the earliest (review S8: days already past don't count).
export function upcomingOverlap(overlapStart: string, overlapEnd: string, todayIso: string): [string, string] {
  return [overlapStart < todayIso ? todayIso : overlapStart, overlapEnd];
}

// Interests both PLANS mention (review S7: never my plan vs their general profile).
export function sharedPlanInterests(mine: string[], theirs: string[]) {
  return mine.filter((v) => theirs.includes(v));
}
