import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embed } from "./openrouter.ts";

// Stores the signed-in user's personality embedding. Takes a "save" slot from the AI
// quota first. Never throws: if the quota is used up or the AI fails, the profile save
// still succeeds and personality simply counts as 0 until the next save or the backfill.
export async function refreshMyProfileEmbedding(text: string) {
  if (!text.trim()) return;
  try {
    const supabase = await createClient();
    const { data: allowed, error: quotaError } = await supabase.rpc("consume_ai_quota", { p_kind: "embed" });
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
