"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractTrip, prepareTripText } from "@/lib/ai/extract-trip";
import { embed } from "@/lib/ai/openrouter";
import { tripEmbeddingText } from "@/lib/ai/trip-text";
import { todayInBerlin, validatePostForm, type PostInput, type TripCard } from "@/lib/posts/card";
import { getMyActivePost } from "@/lib/posts/queries";

// Every AI call costs money on a key without a spending limit, so each one first
// takes a slot from the per-user quota (20 per rolling 24 h, enforced in the database).
async function takeQuota(kind: "extract" | "embed") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_kind: kind });
  if (error) console.error("consume_ai_quota failed:", error.code);
  return data === true;
}

export type ExtractResult =
  | { ok: true; card: TripCard; rawText: string }
  | { ok: false; reason: "empty" | "quota" | "ai"; rawText: string };

// Step 1 of /posts/new: one sentence → AI draft card. Any failure returns a reason
// and the editor falls back to the manual form, keeping the sentence.
export async function extractTripAction(text: string): Promise<ExtractResult> {
  await getCurrentUser();
  const rawText = prepareTripText(String(text ?? ""));
  if (!rawText) return { ok: false, reason: "empty", rawText };
  if (!(await takeQuota("extract"))) return { ok: false, reason: "quota", rawText };
  try {
    const card = await extractTrip(rawText, todayInBerlin());
    return { ok: true, card, rawText };
  } catch (error) {
    console.error("extractTrip failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, reason: "ai", rawText };
  }
}

export type PostFormState = { error?: string };

const QUOTA_MESSAGE = "You've reached today's limit of 20 AI actions. Please try again tomorrow.";
const SAVE_FAILED = "Couldn't save your plan right now. Please try again — nothing you typed is lost.";

async function embedPost(post: PostInput) {
  if (!(await takeQuota("embed"))) return { ok: false as const, error: QUOTA_MESSAGE };
  try {
    return { ok: true as const, vector: JSON.stringify(await embed(tripEmbeddingText(post))) };
  } catch (error) {
    console.error("embed failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: SAVE_FAILED };
  }
}

// Publish a new post. An existing active post is archived in the same transaction
// (public.publish_post; the user confirmed this in the editor, FLOWS 2.1).
export async function publishPost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  await getCurrentUser();
  const parsed = validatePostForm(formData, todayInBerlin().iso);
  if (!parsed.ok) return { error: parsed.error };
  const post = parsed.post;

  const embedding = await embedPost(post);
  if (!embedding.ok) return { error: embedding.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_post", {
    p_raw_text: post.rawText,
    p_city: post.city,
    p_start_date: post.startDate,
    p_end_date: post.endDate,
    p_interests: post.interests,
    p_budget: post.budget,
    p_vibe: post.vibe,
    p_headline: post.headline,
    p_tone: post.tone,
    p_ai_assisted: post.aiAssisted,
    p_embedding: embedding.vector,
  });
  if (error) {
    console.error("publish_post failed:", error.code);
    return { error: SAVE_FAILED };
  }
  redirect("/home?posted=1");
}

// Edit the active post (FLOWS 2.6). Re-embeds because the text changed. The
// "your matches will end" warning arrives with invites in part F.
export async function updatePost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const user = await getCurrentUser();
  const current = await getMyActivePost(user.id);
  if (!current) redirect("/posts/new");

  const parsed = validatePostForm(formData, todayInBerlin().iso, { editing: true });
  if (!parsed.ok) return { error: parsed.error };
  const post = parsed.post;

  const embedding = await embedPost(post);
  if (!embedding.ok) return { error: embedding.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .update({
      raw_text: post.rawText,
      city: post.city,
      start_date: post.startDate,
      end_date: post.endDate,
      interests: post.interests,
      budget: post.budget,
      vibe: post.vibe,
      headline: post.headline,
      tone: post.tone,
      embedding: embedding.vector,
    })
    .eq("id", current.id)
    .eq("status", "active");
  if (error) {
    console.error("updatePost failed:", error.code);
    return { error: SAVE_FAILED };
  }
  redirect("/home?posted=1");
}
