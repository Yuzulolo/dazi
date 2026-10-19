// One row of public.match_my_post() — only safe fields (never birth year, gender,
// preferences, embeddings or raw text). See supabase/migrations/20261018214627_matching.sql.
export type Match = {
  postId: string;
  headline: [string, string];
  tone: string;
  city: string;
  overlapStart: string;
  overlapEnd: string;
  interests: string[];
  displayName: string;
  ageRange: string | null;
  languages: string[];
  isDemo: boolean;
  travelPace: number | null;
  dayRhythm: string | null;
  sharedInterests: string[];
  tripScore: number;
  styleScore: number;
  personalityScore: number;
  totalScore: number;
};

export type MatchReason = { text: string; ai: boolean };
