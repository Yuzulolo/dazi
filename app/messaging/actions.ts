"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flag";
import { containsContactDetails } from "@/lib/profile/contact";

// Invites, chat and block (phase 7b-1). Every rule is enforced again in the database
// functions (send_invite, respond_invite, cancel_invite, send_message, block_from_invite);
// these actions only check the kill switch, give quick feedback and map refusals to text.

export type MessagingState = { error?: string; ok?: boolean };

const OFF = "Invites and chat aren't available yet.";
const FAILED = "That didn't work. Please try again in a moment.";

// Database refusal (our own RAISE text in supabase/migrations/2026102016*_messaging*.sql) → what
// the person sees. Keep in sync with the SQL; the first match wins.
const REFUSALS: [string, string][] = [
  ["shared demo chat", "Other visitors can read the shared demo chat — please don't share contact details here."],
  ["shared demo account", "This is the shared demo account — it can only connect with demo profiles."],
  ["Not one of your matches", "You can only invite people who are in your matches."],
  ["No active post", "Post a plan first — invites go from your plan to theirs."],
  ["Contact details", "Please remove contact details (email or phone number) from your note."],
  ["up to 300", "Your note can be up to 300 characters."],
  ["declined an invite", "They declined an invite for this plan."],
  ["already connected", "You're already connected — open the chat on My plan."],
  ["already invited", "You've already invited them."],
  ["At most 10 pending", "You have 10 pending invites — wait for answers or cancel one."],
  ["no longer open", "This invite is no longer open."],
  ["once the invite is accepted", "You can send messages once the invite is accepted."],
  ["chat is closed", "This chat is closed."],
  ["1 to 1000", "Messages can be 1 to 1000 characters."],
  ["30 messages per hour", "You've sent 30 messages in the last hour — please wait a little."],
  ["not found", "Not found."],
];

function refusal(error: { code?: string; message?: string }) {
  const hit = REFUSALS.find(([needle]) => (error.message ?? "").includes(needle));
  if (!hit) console.error("messaging rpc failed:", error.code);
  return hit ? hit[1] : FAILED;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function refresh(inviteId?: string) {
  revalidatePath("/plan");
  revalidatePath("/matches");
  if (inviteId) revalidatePath(`/chat/${inviteId}`);
}

export async function sendInvite(_prev: MessagingState, formData: FormData): Promise<MessagingState> {
  if (!messagingEnabled()) return { error: OFF };
  await getCurrentUser();
  const postId = text(formData, "postId");
  const note = text(formData, "note");
  if (note.length > 300) return { error: "Your note can be up to 300 characters." };
  if (note && containsContactDetails(note)) {
    return { error: "Please remove contact details (email or phone number) from your note." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_invite", { p_to_post: postId, p_note: note || null });
  if (error) return { error: refusal(error) };
  refresh(data as string);
  return { ok: true };
}

export async function respondInvite(_prev: MessagingState, formData: FormData): Promise<MessagingState> {
  if (!messagingEnabled()) return { error: OFF };
  await getCurrentUser();
  const inviteId = text(formData, "inviteId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_invite", {
    p_invite: inviteId,
    p_accept: text(formData, "answer") === "accept",
  });
  if (error) return { error: refusal(error) };
  refresh(inviteId);
  return { ok: true };
}

export async function cancelInvite(_prev: MessagingState, formData: FormData): Promise<MessagingState> {
  if (!messagingEnabled()) return { error: OFF };
  await getCurrentUser();
  const inviteId = text(formData, "inviteId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invite", { p_invite: inviteId });
  if (error) return { error: refusal(error) };
  refresh(inviteId);
  return { ok: true };
}

export async function sendMessage(_prev: MessagingState, formData: FormData): Promise<MessagingState> {
  if (!messagingEnabled()) return { error: OFF };
  await getCurrentUser();
  const inviteId = text(formData, "inviteId");
  const body = text(formData, "body");
  if (body.length < 1 || body.length > 1000) return { error: "Messages can be 1 to 1000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_message", { p_invite: inviteId, p_body: body });
  if (error) return { error: refusal(error) };
  refresh(inviteId);
  return { ok: true };
}

export async function blockFromInvite(_prev: MessagingState, formData: FormData): Promise<MessagingState> {
  if (!messagingEnabled()) return { error: OFF };
  await getCurrentUser();
  const inviteId = text(formData, "inviteId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_from_invite", { p_invite: inviteId });
  if (error) return { error: refusal(error) };
  refresh(inviteId);
  return { ok: true };
}
