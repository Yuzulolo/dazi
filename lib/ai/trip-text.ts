import { TRAVEL_INTERESTS, labelOf } from "../profile/options.ts";
import { BUDGET_LABELS, type Budget } from "../posts/card.ts";

// The ONE text that gets embedded for a trip. Part D (matching) and part E (guest
// search) must build their query text with this same function and the same model
// (lib/ai/openrouter.ts EMBEDDING_MODEL), or similarities stop meaning anything.
export function tripEmbeddingText(trip: {
  city: string;
  startDate: string;
  endDate: string;
  interests: string[];
  budget: Budget | null;
  vibe: string | null;
  rawText: string;
}) {
  return [
    `City: ${trip.city}.`,
    `Dates: ${trip.startDate} to ${trip.endDate}.`,
    `Interests: ${trip.interests.map((v) => labelOf(TRAVEL_INTERESTS, v)).join(", ")}.`,
    trip.budget ? `Budget: ${BUDGET_LABELS[trip.budget]}.` : null,
    trip.vibe ? `Vibe: ${trip.vibe}.` : null,
    `Plan: ${trip.rawText}`,
  ]
    .filter(Boolean)
    .join(" ");
}
