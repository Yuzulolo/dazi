// Restores the public demo login to a known state. LOCAL ONLY — uses the service role key.
// Anyone who signs in as Demo (README / "Try the demo account") can change its profile, plan
// or even its password from the browser, so run this before a demo or a grading session.
//
//   node --conditions=react-server --env-file=.env.local scripts/reset-demo-account.mjs
//
// - finds the account by profiles.is_protected = true (no email in code)
// - resets its password to DEMO_PASSWORD from .env.local (admin API)
// - restores the profile from scripts/seed/demo-account.json (+ personality embedding)
// - replaces its plans with one Berlin plan starting 2 days from today (+ trip embedding)
//   (deleting the old plans also removes their cached match reasons — cascade)
// - clears its AI usage counters via public.reset_demo_ai_quota() (service role only; it can
//   only ever touch the account flagged is_protected)
// - phase 7b: removes every invite (→ messages, cascade) and block visitors made on the demo
//   login, then seeds ONE accepted invite with a seeded demo user (demo-02, or the first demo
//   user with an active plan) + 4 friendly messages, so the chat can be shown. The database
//   only lets the demo login connect with is_demo profiles (private.demo_pair_ok).
// Costs: 2 embedding calls. Existing demo SESSIONS are not
// signed out by this script (the admin API can't list them): run the one-line SQL in
// CLAUDE.md ("Demo account") in the Supabase SQL Editor when someone changed the password.
import { readFile } from "node:fs/promises";
import { adminClient, listDemoUsers } from "./lib/admin.mjs";
import { embed } from "../lib/ai/openrouter.ts";
import { tripEmbeddingText } from "../lib/ai/trip-text.ts";
import { profileEmbeddingText } from "../lib/ai/profile-text.ts";
import { todayInBerlin } from "../lib/posts/card.ts";

const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error("Missing DEMO_PASSWORD in .env.local");
  process.exit(1);
}

const admin = adminClient();
const { data: rows, error: findError } = await admin.from("profiles").select("id").eq("is_protected", true);
if (findError) throw findError;
if (rows.length !== 1) {
  console.error(`Expected exactly one protected account, found ${rows.length}. Nothing changed.`);
  process.exit(1);
}
const id = rows[0].id;
const { data: authUser } = await admin.auth.admin.getUserById(id);
if (process.env.DEMO_EMAIL && authUser?.user?.email !== process.env.DEMO_EMAIL) {
  console.error("The protected account's email does not match DEMO_EMAIL in .env.local. Nothing changed.");
  process.exit(1);
}

const { error: pwError } = await admin.auth.admin.updateUserById(id, { password });
if (pwError) throw new Error(`password reset: ${pwError.message}`);
console.log("ok  password reset to DEMO_PASSWORD");

const { profile: p, post } = JSON.parse(await readFile(new URL("./seed/demo-account.json", import.meta.url), "utf8"));
const profileVector = await embed(
  profileEmbeddingText({ bio: p.bio, hobbies: p.hobbies, visitedCities: p.visited_cities, travelInterests: p.travel_interests }),
);
const { error: profileError } = await admin
  .from("profiles")
  .update({ ...p, onboarding_completed_at: new Date().toISOString(), profile_embedding: JSON.stringify(profileVector) })
  .eq("id", id);
if (profileError) throw new Error(`profile: ${profileError.message}`);
console.log(`ok  profile restored (${p.display_name})`);

const today = todayInBerlin().iso;
const shift = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const plan = {
  city: "Berlin", startDate: shift(post.start_offset), endDate: shift(post.start_offset + post.days - 1),
  interests: post.interests, budget: post.budget, vibe: post.vibe, rawText: post.raw_text,
};
// Everything visitors did with invites / chat / blocks on the demo login (messages cascade).
const { error: invitesError, count: invitesRemoved } = await admin
  .from("invites").delete({ count: "exact" }).or(`from_user.eq.${id},to_user.eq.${id}`);
if (invitesError) throw new Error(`invites: ${invitesError.message}`);
const { error: blocksError, count: blocksRemoved } = await admin
  .from("blocks").delete({ count: "exact" }).or(`blocker_id.eq.${id},blocked_id.eq.${id}`);
if (blocksError) throw new Error(`blocks: ${blocksError.message}`);
console.log(`ok  removed ${invitesRemoved ?? 0} invite(s) (+ their messages) and ${blocksRemoved ?? 0} block(s)`);

const { error: deleteError } = await admin.from("posts").delete().eq("user_id", id);
if (deleteError) throw new Error(`old plans: ${deleteError.message}`);
const { data: demoPost, error: postError } = await admin.from("posts").insert({
  user_id: id,
  raw_text: plan.rawText,
  city: plan.city,
  start_date: plan.startDate,
  end_date: plan.endDate,
  interests: plan.interests,
  budget: plan.budget,
  vibe: plan.vibe,
  headline: post.headline,
  tone: post.tone,
  ai_assisted: false,
  embedding: JSON.stringify(await embed(tripEmbeddingText(plan))),
}).select("id").single();
if (postError) throw new Error(`plan: ${postError.message}`);
console.log(`ok  plan restored: Berlin ${plan.startDate} → ${plan.endDate} "${post.headline.join(" ")}"`);

// One accepted invite + a short chat with a seeded demo user (service role, direct writes).
const { flagged } = await listDemoUsers(admin);
const ordered = [...flagged].sort((a, b) => (a.email === "demo-02@dazi-demo.invalid" ? -1 : b.email === "demo-02@dazi-demo.invalid" ? 1 : 0));
let partner = null;
for (const u of ordered) {
  const { data: theirPost } = await admin
    .from("posts").select("id").eq("user_id", u.id).eq("status", "active").gte("end_date", today).maybeSingle();
  if (theirPost) {
    partner = { id: u.id, postId: theirPost.id };
    break;
  }
}
if (!partner) {
  console.log("WARN  no demo user with an active plan — skipped the demo chat (run scripts/seed-demo.mjs)");
} else {
  const { data: invite, error: inviteError } = await admin.from("invites").insert({
    from_user: partner.id, to_user: id, from_post: partner.postId, to_post: demoPost.id,
    note: "Hi! Looks like we're in Berlin at the same time — fancy a flea market morning?",
    status: "accepted", responded_at: new Date().toISOString(),
  }).select("id").single();
  if (inviteError) throw new Error(`demo invite: ${inviteError.message}`);
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
  const chat = [
    [partner.id, "Hey! Thanks for accepting 😊 Mauerpark on Sunday morning?", 42],
    [id, "Yes, I'd love that! Around 10, before it gets too busy?", 38],
    [partner.id, "Perfect. Let's meet at the main entrance on Bernauer Straße.", 35],
    [id, "Great — and maybe coffee afterwards. See you there!", 31],
  ];
  const { error: chatError } = await admin.from("messages").insert(
    chat.map(([sender, body, ago]) => ({ invite_id: invite.id, sender_id: sender, body, created_at: minutesAgo(ago) })),
  );
  if (chatError) throw new Error(`demo chat: ${chatError.message}`);
  console.log(`ok  demo chat seeded (1 accepted invite, ${chat.length} messages)`);
}

const { data: cleared, error: quotaError } = await admin.rpc("reset_demo_ai_quota");
if (quotaError) throw new Error(`AI counters: ${quotaError.message}`);
console.log(`ok  AI usage counters cleared (${cleared} rows)`);
console.log("\nDemo account reset.");
