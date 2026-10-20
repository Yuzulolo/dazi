import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired" | "closed";

// One row of public.my_invites(): the invite + the other person's plan, with the same safe
// columns as match_my_post() (no user id, birth year, gender, preferences or embeddings).
export type Invite = {
  id: string;
  direction: "sent" | "received";
  status: InviteStatus;
  note: string | null;
  createdAt: string;
  postId: string; // the other person's plan
  headline: string[];
  tone: string;
  city: string;
  overlapStart: string;
  overlapEnd: string;
  displayName: string;
  ageRange: string | null;
  isDemo: boolean;
};

export type ChatMessage = { id: number; mine: boolean; body: string; createdAt: string };

type InviteRow = {
  invite_id: string; direction: "sent" | "received"; status: InviteStatus; note: string | null;
  created_at: string; post_id: string; headline: string[]; tone: string; city: string;
  overlap_start: string; overlap_end: string; display_name: string; age_range: string | null; is_demo: boolean;
};

// null = the call failed (the page shows a message instead of breaking).
export async function getMyInvites(): Promise<Invite[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_invites");
  if (error) {
    console.error("my_invites failed:", error.code);
    return null;
  }
  return (data as InviteRow[]).map((r) => ({
    id: r.invite_id,
    direction: r.direction,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    postId: r.post_id,
    headline: r.headline,
    tone: r.tone,
    city: r.city,
    overlapStart: r.overlap_start,
    overlapEnd: r.overlap_end,
    displayName: r.display_name,
    ageRange: r.age_range,
    isDemo: r.is_demo,
  }));
}

export async function getPendingInviteCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_pending_invite_count");
  if (error) return 0;
  return data as number;
}

// Messages of one chat. RLS (private.can_chat) returns rows only to the two participants of
// an accepted, unblocked invite — anyone else gets an empty list.
export async function getChatMessages(inviteId: string, userId: string): Promise<ChatMessage[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("invite_id", inviteId)
    .order("created_at", { ascending: false })
    .limit(500); // the newest 500 (review S4), shown oldest first
  if (error) {
    console.error("messages read failed:", error.code);
    return null;
  }
  return data.reverse().map((m) => ({ id: m.id, mine: m.sender_id === userId, body: m.body, createdAt: m.created_at }));
}
