// Seeds 30 fictional demo users with Berlin plans (part D). LOCAL ONLY — uses the
// service role key. Idempotent: existing demo users are updated, their plans replaced
// with fresh upcoming dates. Every demo profile has is_demo = true (UI shows a badge).
//
//   node --conditions=react-server --env-file=.env.local scripts/seed-demo.mjs
//   node --conditions=react-server --env-file=.env.local scripts/seed-demo.mjs --cleanup
//
// Costs: 60 embedding calls (~$0.0002) on a seed run; nothing on --cleanup.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { adminClient, DEMO_DOMAINS, isDemoEmail, listAllUsers } from "./lib/admin.mjs";
import { embed } from "../lib/ai/openrouter.ts";
import { tripEmbeddingText } from "../lib/ai/trip-text.ts";
import { profileEmbeddingText } from "../lib/ai/profile-text.ts";
import { todayInBerlin } from "../lib/posts/card.ts";

const admin = adminClient();
const existing = (await listAllUsers(admin)).filter((u) => isDemoEmail(u.email));

if (process.argv.includes("--cleanup")) {
  for (const user of existing) {
    const { error } = await admin.auth.admin.deleteUser(user.id); // cascades to profile + posts
    console.log(`${error ? "FAILED " : "deleted"}  ${user.email}${error ? `: ${error.message}` : ""}`);
  }
  console.log(`\nRemoved ${existing.length} demo users.`);
  process.exit(0);
}

const { users } = JSON.parse(await readFile(new URL("./seed/demo-users.json", import.meta.url), "utf8"));
const today = todayInBerlin().iso;
const shift = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

let domain = existing[0]?.email.split("@")[1] ?? DEMO_DOMAINS[0];
let created = 0;
let updated = 0;

for (const d of users) {
  let user = existing.find((u) => u.email.startsWith(`${d.key}@`));
  if (!user) {
    const attempt = (dom) =>
      admin.auth.admin.createUser({
        email: `${d.key}@${dom}`,
        password: `${randomUUID()}Aa1!`, // never stored; nobody logs in as a demo user
        email_confirm: true, // no confirmation email is sent
        user_metadata: { display_name: d.display_name, birth_year: d.birth_year },
      });
    let { data, error } = await attempt(domain);
    if (error && domain === DEMO_DOMAINS[0] && /email/i.test(error.message)) {
      console.log(`Supabase refused @${domain} (${error.message}); falling back to @${DEMO_DOMAINS[1]}`);
      domain = DEMO_DOMAINS[1];
      ({ data, error } = await attempt(domain));
    }
    if (error) throw new Error(`createUser ${d.key}: ${error.message}`);
    user = data.user;
    created++;
  } else {
    updated++;
  }

  const profileText = profileEmbeddingText({
    bio: d.bio, hobbies: d.hobbies, visitedCities: d.visited_cities, travelInterests: d.travel_interests,
  });
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: d.display_name,
      gender: d.gender,
      languages: d.languages,
      home_city: d.home_city,
      bio: d.bio,
      visited_cities: d.visited_cities,
      hobbies: d.hobbies,
      pref_age_min: d.pref_age_min,
      pref_age_max: d.pref_age_max,
      pref_gender: d.pref_gender,
      travel_pace: d.travel_pace,
      day_rhythm: d.day_rhythm,
      travel_interests: d.travel_interests,
      onboarding_completed_at: new Date().toISOString(),
      is_demo: true,
      profile_embedding: JSON.stringify(await embed(profileText)),
    })
    .eq("id", user.id);
  if (profileError) throw new Error(`profile ${d.key}: ${profileError.message}`);

  // Replace the demo user's plans with one fresh, upcoming plan.
  await admin.from("posts").delete().eq("user_id", user.id);
  const p = d.post;
  const post = {
    city: "Berlin", startDate: shift(p.start_offset), endDate: shift(p.start_offset + p.days - 1),
    interests: p.interests, budget: p.budget, vibe: p.vibe, rawText: p.raw_text,
  };
  const { error: postError } = await admin.from("posts").insert({
    user_id: user.id,
    raw_text: post.rawText,
    city: post.city,
    start_date: post.startDate,
    end_date: post.endDate,
    interests: post.interests,
    budget: post.budget,
    vibe: post.vibe,
    headline: p.headline,
    tone: p.tone,
    ai_assisted: false,
    embedding: JSON.stringify(await embed(tripEmbeddingText(post))),
  });
  if (postError) throw new Error(`post ${d.key}: ${postError.message}`);
  console.log(`ok  ${user.email.padEnd(28)} ${d.display_name.padEnd(7)} Berlin ${post.startDate} → ${post.endDate}  "${p.headline.join(" ")}"`);
}

console.log(`\nDemo users: ${created} created, ${updated} updated (domain @${domain}). Today (Berlin): ${today}.`);
