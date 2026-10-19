import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Match } from "./types";

type MatchRow = {
  post_id: string; headline: string[]; tone: string; city: string;
  overlap_start: string; overlap_end: string; interests: string[];
  display_name: string; age_range: string | null; languages: string[]; is_demo: boolean;
  travel_pace: number | null; day_rhythm: string | null; shared_interests: string[];
  trip_score: number; style_score: number; personality_score: number; total_score: number;
};

// The caller's top matches. This RPC is the ONLY way other users' posts reach the app:
// hard filters (incl. mutual age/gender preferences) and scoring run in the database.
// null = matching failed: /home shows a message in "For you" instead of breaking (review W2).
export async function getMyMatches(limit = 5): Promise<Match[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_my_post");
  if (error) {
    console.error("match_my_post failed:", error.code);
    return null;
  }
  return ((data ?? []) as MatchRow[]).slice(0, limit).map((r) => ({
    postId: r.post_id,
    headline: [r.headline[0], r.headline[1]],
    tone: r.tone,
    city: r.city,
    overlapStart: r.overlap_start,
    overlapEnd: r.overlap_end,
    interests: r.interests,
    displayName: r.display_name,
    ageRange: r.age_range,
    languages: r.languages,
    isDemo: r.is_demo,
    travelPace: r.travel_pace,
    dayRhythm: r.day_rhythm,
    sharedInterests: r.shared_interests,
    tripScore: r.trip_score,
    styleScore: r.style_score,
    personalityScore: r.personality_score,
    totalScore: r.total_score,
  }));
}

// "Try ±3 days → 4 people" for the no-match state. Counts only, no AI.
export async function getMatchSuggestion(): Promise<{ extraDays: number; matches: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_suggestion");
  if (error) {
    console.error("match_suggestion failed:", error.code);
    return null;
  }
  const best = ((data ?? []) as { extra_days: number; matches: number }[]).find((r) => r.matches > 0);
  return best ? { extraDays: best.extra_days, matches: best.matches } : null;
}
