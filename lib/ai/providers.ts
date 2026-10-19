import { CHAT_MODELS, EMBEDDING_MODEL } from "./openrouter.ts";

// The AI models Dazi uses, read from the same constants the AI code calls (so the
// privacy page can never drift from the code). OpenRouter ids look like "google/gemini-…".
const PROVIDERS: Record<string, string> = { google: "Google", openai: "OpenAI", anthropic: "Anthropic" };

export function describeModel(id: string) {
  const [vendor, ...rest] = id.split("/");
  return { id, provider: PROVIDERS[vendor] ?? vendor, name: rest.join("/") };
}

export const AI_MODELS = {
  // lib/ai/extract-trip.ts and lib/ai/match-reasons.ts both call chatJson(), which uses CHAT_MODELS.
  chat: CHAT_MODELS.map(describeModel), // [primary, fallback]
  embedding: describeModel(EMBEDDING_MODEL),
};
