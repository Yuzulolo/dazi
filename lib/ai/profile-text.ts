import { TRAVEL_INTERESTS, labelOf } from "../profile/options.ts";

// The ONE text that gets embedded for a person (the "personality" part of matching,
// SPEC §5). Same model as posts (lib/ai/openrouter.ts EMBEDDING_MODEL). The seed and
// backfill scripts use this same function, so every profile is comparable.
export function profileEmbeddingText(profile: {
  bio: string | null;
  hobbies: string[];
  visitedCities: string[];
  travelInterests: string[];
}) {
  return [
    profile.bio ? `About me: ${profile.bio}` : null,
    profile.hobbies.length ? `Hobbies: ${profile.hobbies.join(", ")}.` : null,
    profile.visitedCities.length ? `Cities I've visited: ${profile.visitedCities.join(", ")}.` : null,
    profile.travelInterests.length
      ? `Travel interests: ${profile.travelInterests.map((v) => labelOf(TRAVEL_INTERESTS, v)).join(", ")}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
