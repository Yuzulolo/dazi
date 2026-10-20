// Fills in the personality embedding for every onboarded profile that has none
// (users who onboarded before part D). LOCAL ONLY — uses the service role key.
// Idempotent: profiles that already have an embedding are skipped.
// --all re-embeds EVERY onboarded profile (after lib/ai/profile-text.ts changes wording,
// e.g. phase 7a "Cities I love to travel to"). One embedding call per profile.
//
//   node --conditions=react-server --env-file=.env.local scripts/backfill-profile-embeddings.mjs [--all]
import { adminClient } from "./lib/admin.mjs";
import { embed } from "../lib/ai/openrouter.ts";
import { profileEmbeddingText } from "../lib/ai/profile-text.ts";

const all = process.argv.includes("--all");
const admin = adminClient();
let query = admin
  .from("profiles")
  .select("id, display_name, bio, hobbies, visited_cities, travel_interests")
  .not("onboarding_completed_at", "is", null);
if (!all) query = query.is("profile_embedding", null);
const { data, error } = await query;
if (error) throw error;

let done = 0;
for (const p of data) {
  const text = profileEmbeddingText({
    bio: p.bio, hobbies: p.hobbies, visitedCities: p.visited_cities, travelInterests: p.travel_interests,
  });
  if (!text) {
    console.log(`skip  ${p.display_name}: nothing to embed`);
    continue;
  }
  const { error: updateError } = await admin
    .from("profiles")
    .update({ profile_embedding: JSON.stringify(await embed(text)) })
    .eq("id", p.id);
  console.log(`${updateError ? "FAIL" : "ok  "}  ${p.display_name}${updateError ? `: ${updateError.message}` : ""}`);
  if (!updateError) done++;
}
console.log(
  all
    ? `\nRe-embedded ${done} of ${data.length} onboarded profiles.`
    : `\nBackfilled ${done} of ${data.length} profiles without a personality embedding.`,
);
