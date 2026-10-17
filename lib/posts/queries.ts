import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayInBerlin, type Budget, type Tone } from "./card";

// The signed-in user's own active post. Posts are owner-only (RLS), and the
// embedding column is never readable from here — columns are always listed.
export type MyPost = {
  id: string;
  rawText: string;
  city: string;
  startDate: string;
  endDate: string;
  interests: string[];
  budget: Budget | null;
  vibe: string | null;
  headline: [string, string];
  tone: Tone;
  aiAssisted: boolean;
  ended: boolean; // end date has passed; still "active" until part D closes it automatically (FLOWS 2.1)
};

export async function getMyActivePost(userId: string): Promise<MyPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, raw_text, city, start_date, end_date, interests, budget, vibe, headline, tone, ai_assisted")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Could not load your post: ${error.code}`);
  if (!data) return null;
  return {
    id: data.id,
    rawText: data.raw_text,
    city: data.city,
    startDate: data.start_date,
    endDate: data.end_date,
    interests: data.interests,
    budget: data.budget as Budget | null,
    vibe: data.vibe,
    headline: [data.headline[0], data.headline[1]],
    tone: data.tone as Tone,
    aiAssisted: data.ai_assisted,
    ended: data.end_date < todayInBerlin().iso,
  };
}
