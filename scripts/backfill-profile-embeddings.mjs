// Fills in the personality embedding for every onboarded profile that has none
// (users who onboarded before part D). LOCAL ONLY — uses the service role key.
// Idempotent: profiles that already have an embedding are skipped.
//
//   node --conditions=react-server --env-file=.env.local scripts/backfill-profile-embeddings.mjs
import { adminClient } from "./lib/admin.mjs";
import { embed } from "../lib/ai/openrouter.ts";
import { profileEmbeddingText } from "../lib/ai/profile-text.ts";

const admin = adminClient();
const { data, error } = await admin
  .from("profiles")
  .select("id, display_name, bio, hobbies, visited_cities, travel_interests")
  .not("onboarding_completed_at", "is", null)
  .is("profile_embedding", null);
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
console.log(`\nBackfilled ${done} of ${data.length} profiles without a personality embedding.`);
