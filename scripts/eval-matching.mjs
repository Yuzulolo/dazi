// Matching eval (part D). LOCAL ONLY — uses the service role key. No AI calls.
// 1. Ranking: for each viewer in evals/matching.json, is the hand-picked best buddy in
//    the top 3? Reported for trip only → trip + style → trip + style + personality.
// 2. Hard filters: temporary fixture users in a fake city ("Filtertown") — 10 must be
//    excluded, 1 positive control must appear. Fixtures are deleted afterwards.
//
//   node --env-file=.env.local scripts/eval-matching.mjs
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { adminClient, isDemoEmail, listAllUsers } from "./lib/admin.mjs";

const admin = adminClient();
const { cases } = JSON.parse(await readFile(new URL("../evals/matching.json", import.meta.url), "utf8"));
const users = (await listAllUsers(admin)).filter((u) => isDemoEmail(u.email));
const domain = users[0]?.email.split("@")[1] ?? "dazi-demo.invalid"; // same domain the seed used
const idOf = (key) => users.find((u) => u.email.startsWith(`${key}@`))?.id;

// ---------- 1. ranking ----------
const WEIGHTS = [
  ["trip only", [1, 0, 0]],
  ["trip + style", [0.4 / 0.75, 0.35 / 0.75, 0]],
  ["trip + style + personality", [0.4, 0.35, 0.25]],
];
const { data: buddyPosts } = await admin.from("posts").select("id, user_id").eq("status", "active");
const postOf = (userId) => buddyPosts.find((p) => p.user_id === userId)?.id;

console.log("Ranking: is the hand-picked best buddy in the top 3?\n");
const hits = Object.fromEntries(WEIGHTS.map(([name]) => [name, 0]));
const hitsAny = Object.fromEntries(WEIGHTS.map(([name]) => [name, 0])); // best buddy OR one of the "also good"
for (const c of cases) {
  const viewer = idOf(c.viewer);
  const buddyPost = postOf(idOf(c.best_buddy));
  const ranks = [];
  for (const [name, [wt, ws, wp]] of WEIGHTS) {
    const { data, error } = await admin.rpc("match_candidates_for_eval", {
      p_user: viewer, w_trip: wt, w_style: ws, w_personality: wp, p_limit: 10,
    });
    if (error) throw new Error(`${c.viewer}: ${error.message}`);
    const rank = data.findIndex((r) => r.post_id === buddyPost) + 1;
    if (rank >= 1 && rank <= 3) hits[name]++;
    const accepted = [buddyPost, ...(c.also_good ?? []).map((k) => postOf(idOf(k)))];
    if (data.slice(0, 3).some((r) => accepted.includes(r.post_id))) hitsAny[name]++;
    ranks.push(rank === 0 ? "—" : `#${rank}`);
  }
  const tag = `${c.picked_by === "director" ? "director" : "developer"}${c.pool_size ? `, pool ${c.pool_size}` : ""}`;
  console.log(`${c.viewer} → ${c.best_buddy}  (${tag})   ${WEIGHTS.map(([n], i) => `${n}: ${ranks[i]}`).join(" · ")}`);
}
console.log("\nTop-3 hit rate (best buddy)          | best buddy or an 'also good' pick");
for (const [name] of WEIGHTS) console.log(`  ${name.padEnd(28)} ${hits[name]}/${cases.length}      | ${hitsAny[name]}/${cases.length}`);

// ---------- 2. hard filters ----------
console.log("\nHard filters (Filtertown fixtures)\n");
const vector = `[${Array(1536).fill(0.01).join(",")}]`;
const year = Number(new Date().toISOString().slice(0, 4));
const today = new Date().toISOString().slice(0, 10);
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const base = { languages: ["en"], gender: "woman", pref_gender: null, pref_age_min: 18, pref_age_max: 99, age: 30, city: "Filtertown", start: 3, end: 6, onboarded: true };
const viewerSpec = { ...base, gender: "man", pref_gender: "woman", pref_age_min: 25, pref_age_max: 35 };
const fixtures = [
  ["control: everything matches (must APPEAR)", {}, true],
  ["no shared language", { languages: ["de"] }],
  ["candidate older than the viewer's range", { age: 45 }],
  ["viewer outside the candidate's age range", { pref_age_min: 18, pref_age_max: 25 }],
  ["candidate's gender ≠ viewer's preference", { gender: "man" }],
  ["viewer's gender ≠ candidate's preference", { pref_gender: "woman" }],
  ["candidate has no gender, viewer has a preference", { gender: null }],
  ["candidate gender 'other', viewer has a preference", { gender: "other" }],
  ["dates don't overlap", { start: 10, end: 12 }],
  ["different city", { city: "Othertown" }],
  ["candidate not onboarded", { onboarded: false }],
];
const created = [];
async function makeUser(label, spec) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `eval-${randomUUID().slice(0, 8)}@${domain}`,
    password: `${randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: { display_name: "Eval", birth_year: year - spec.age },
  });
  if (error) throw new Error(`fixture "${label}": ${error.message}`);
  created.push(data.user.id);
  const { error: pe } = await admin.from("profiles").update({
    gender: spec.gender, languages: spec.languages, home_city: "Filtertown", pref_age_min: spec.pref_age_min,
    pref_age_max: spec.pref_age_max, pref_gender: spec.pref_gender, travel_pace: 3, day_rhythm: "flexible",
    travel_interests: ["cafes"], is_demo: true, onboarding_completed_at: new Date().toISOString(),
  }).eq("id", data.user.id);
  if (pe) throw new Error(`fixture profile "${label}": ${pe.message}`);
  const { data: post, error: po } = await admin.from("posts").insert({
    user_id: data.user.id, raw_text: "Eval fixture", city: spec.city, start_date: day(spec.start), end_date: day(spec.end),
    interests: ["cafes"], headline: ["Eval.", "Fixture."], tone: "mint", embedding: vector,
  }).select("id").single();
  if (po) throw new Error(`fixture post "${label}": ${po.message}`);
  if (!spec.onboarded) await admin.from("profiles").update({ onboarding_completed_at: null }).eq("id", data.user.id);
  return { userId: data.user.id, postId: post.id };
}
let excluded = 0;
let controlFound = false;
try {
  const viewer = await makeUser("viewer", viewerSpec);
  const made = [];
  for (const [label, overrides, isControl] of fixtures) made.push([label, await makeUser(label, { ...base, ...overrides }), isControl]);
  const { data, error } = await admin.rpc("match_candidates_for_eval", {
    p_user: viewer.userId, w_trip: 0.4, w_style: 0.35, w_personality: 0.25, p_limit: 100,
  });
  if (error) throw error;
  const seen = new Set(data.map((r) => r.post_id));
  for (const [label, f, isControl] of made) {
    const appears = seen.has(f.postId);
    if (isControl) controlFound = appears;
    else if (!appears) excluded++;
    console.log(`${(isControl ? appears : !appears) ? "PASS" : "FAIL"}  ${label}  (${appears ? "appears" : "excluded"})`);
  }
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
}
console.log(`\nHard filters: ${excluded}/${fixtures.length - 1} excluded, control ${controlFound ? "found" : "MISSING"}. Fixtures deleted (${created.length}).`);
