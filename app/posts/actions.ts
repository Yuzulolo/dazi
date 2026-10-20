"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractTrip, prepareTripText } from "@/lib/ai/extract-trip";
import { embed } from "@/lib/ai/openrouter";
import { tripEmbeddingText } from "@/lib/ai/trip-text";
import { todayInBerlin, validatePostForm, type PostInput, type TripCard } from "@/lib/posts/card";
import { getMyActivePost } from "@/lib/posts/queries";

// Every AI call costs money on a key without a spending limit, so each one first
// takes a slot from the quota (per user: 20 drafts + 20 saves per rolling 24 h; whole
// site: 1,000 per 24 h — enforced in the database). An error is reported as an error,
// not as "limit reached" (review S2); either way no AI call is made.
async function takeQuota(kind: "extract" | "embed"): Promise<"ok" | "limit" | "error"> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_kind: kind });
  if (error) {
    console.error("consume_ai_quota failed:", error.code);
    return "error";
  }
  return data === true ? "ok" : "limit";
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
  const quota = await takeQuota("extract");
  if (quota !== "ok") return { ok: false, reason: quota === "limit" ? "quota" : "ai", rawText };
  try {
    const card = await extractTrip(rawText, todayInBerlin());
    return { ok: true, card, rawText };
  } catch (error) {
    console.error("extractTrip failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, reason: "ai", rawText };
  }
}

export type PostFormState = { error?: string };

// After a save, every page that shows the post must be re-rendered from the server.
// Without this the browser reuses its copy of /posts/edit (Next 16 client cache +
// Activity), and the editor showed the previous values (re-test bug, 18 Oct).
function refreshPostPages() {
  for (const path of ["/plan", "/matches", "/posts/edit", "/posts/new"]) revalidatePath(path);
}

const QUOTA_MESSAGE = "You've reached today's limit of 20 saves. Please try again tomorrow — nothing you typed is lost.";
const SAVE_FAILED = "Couldn't save your plan right now. Please try again — nothing you typed is lost.";
// The database's own rules (posts_guard / CHECKs) answer with 23514 if something slipped past.
const DB_REFUSED = "This plan can't be saved: please remove contact details and check the dates.";

async function embedPost(post: PostInput) {
  const quota = await takeQuota("embed");
  if (quota !== "ok") return { ok: false as const, error: quota === "limit" ? QUOTA_MESSAGE : SAVE_FAILED };
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
    return { error: error.code === "23514" ? DB_REFUSED : SAVE_FAILED };
  }
  refreshPostPages();
  redirect("/matches?posted=1");
}

// Edit the active post (FLOWS 2.6) through public.update_post, which only ever touches
// the caller's active post and raises if there is none (review W5). The embedding is only
// recomputed when the text it is built from changed (review W2: tone/headline edits are free).
// The "your matches will end" warning arrives with invites in part F.
export async function updatePost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const user = await getCurrentUser();
  const current = await getMyActivePost(user.id);
  if (!current || current.ended) redirect("/posts/new");

  const parsed = validatePostForm(formData, todayInBerlin().iso, { currentStartDate: current.startDate });
  if (!parsed.ok) return { error: parsed.error };
  const post = parsed.post;

  let vector: string | null = null;
  if (tripEmbeddingText(post) !== tripEmbeddingText(current)) {
    const embedding = await embedPost(post);
    if (!embedding.ok) return { error: embedding.error };
    vector = embedding.vector;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_post", {
    p_raw_text: post.rawText,
    p_city: post.city,
    p_start_date: post.startDate,
    p_end_date: post.endDate,
    p_interests: post.interests,
    p_budget: post.budget,
    p_vibe: post.vibe,
    p_headline: post.headline,
    p_tone: post.tone,
    p_embedding: vector,
  });
  if (error) {
    console.error("update_post failed:", error.code);
    if (error.code === "P0002") return { error: "This plan was replaced or ended in the meantime. Please reload the page." };
    return { error: error.code === "23514" ? DB_REFUSED : SAVE_FAILED };
  }
  refreshPostPages();
  redirect("/matches?posted=1");
}
