import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embed } from "./openrouter.ts";
import { profileEmbeddingText } from "./profile-text.ts";
import { getMyProfile } from "@/lib/profile/queries";
import { splitList } from "@/lib/profile/validate";

// Stores the signed-in user's personality embedding. Takes a "profile" slot from the AI
// quota first (own budget: 10 per user / 24 h, separate from plan saves — review W3). Never throws: if the quota is used up or the AI fails, the profile save
// still succeeds and personality simply counts as 0 until the next save or the backfill.
export async function refreshMyProfileEmbedding(text: string) {
  if (!text.trim()) return;
  try {
    const supabase = await createClient();
    const { data: allowed, error: quotaError } = await supabase.rpc("consume_ai_quota", { p_kind: "profile" });
    if (quotaError || allowed !== true) {
      if (quotaError) console.error("consume_ai_quota failed:", quotaError.code);
      return;
    }
    const vector = await embed(text);
    const { error } = await supabase.rpc("set_my_profile_embedding", { p_embedding: JSON.stringify(vector) });
    if (error) console.error("set_my_profile_embedding failed:", error.code);
  } catch (error) {
    console.error("profile embedding failed:", error instanceof Error ? error.message : "unknown error");
  }
}

// The text a profile is embedded from, read from the signed-in user's own stored profile.
// Returns null if it can't be read — callers treat that like an AI failure (review W4).
export async function myProfileEmbeddingText(): Promise<string | null> {
  try {
    const { values } = await getMyProfile();
    return profileEmbeddingText({
      bio: values.bio || null,
      hobbies: splitList(values.hobbies),
      visitedCities: splitList(values.visitedCities),
      travelInterests: values.travelInterests,
    });
  } catch (error) {
    console.error("profile read for embedding failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}
