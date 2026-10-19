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
// Costs: 2 embedding calls. Existing demo SESSIONS are not
// signed out by this script (the admin API can't list them): run the one-line SQL in
// CLAUDE.md ("Demo account") in the Supabase SQL Editor when someone changed the password.
import { readFile } from "node:fs/promises";
import { adminClient } from "./lib/admin.mjs";
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
const { error: deleteError } = await admin.from("posts").delete().eq("user_id", id);
if (deleteError) throw new Error(`old plans: ${deleteError.message}`);
const { error: postError } = await admin.from("posts").insert({
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
});
if (postError) throw new Error(`plan: ${postError.message}`);
console.log(`ok  plan restored: Berlin ${plan.startDate} → ${plan.endDate} "${post.headline.join(" ")}"`);

const { data: cleared, error: quotaError } = await admin.rpc("reset_demo_ai_quota");
if (quotaError) throw new Error(`AI counters: ${quotaError.message}`);
console.log(`ok  AI usage counters cleared (${cleared} rows)`);
console.log("\nDemo account reset.");
