import "server-only";

// The only place that talks to OpenRouter. Server-side only: the key never
// reaches the browser. Imports use .ts extensions so scripts/eval-extraction.mjs
// can run this file with plain Node.

// Chosen 17 Oct 2026 from the models the school key allows (Claude Haiku 5.5 is
// blocked by its guardrail): cheap, fast, strict JSON schema, good Chinese/German.
export const CHAT_MODELS = ["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"]; // main, fallback
// Same model at insert time and at query time (CLAUDE.md).
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

const BASE_URL = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 15_000;

export class AIError extends Error {}

async function call(path: string, body: unknown) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AIError("OPENROUTER_API_KEY is not set");
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
      "X-Title": "Dazi",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.error) {
    // Status and message only — never the request (user text) or the key.
    throw new AIError(`OpenRouter ${path} failed: ${response.status} ${json?.error?.message ?? ""}`.trim());
  }
  return json;
}

// One chat completion constrained to a strict JSON schema. Returns the parsed object.
export async function chatJson(params: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<unknown> {
  const json = await call("/chat/completions", {
    models: CHAT_MODELS,
    temperature: 0,
    max_tokens: params.maxTokens ?? 400,
    provider: { require_parameters: true }, // only endpoints that honour the JSON schema
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: params.schemaName, strict: true, schema: params.schema },
    },
  });
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new AIError("OpenRouter returned no content");
  try {
    return JSON.parse(content);
  } catch {
    throw new AIError("OpenRouter returned invalid JSON");
  }
}

// Embedding vector for one text (1536 numbers).
export async function embed(text: string): Promise<number[]> {
  const json = await call("/embeddings", { model: EMBEDDING_MODEL, input: text });
  const vector = json.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new AIError("OpenRouter returned an unexpected embedding");
  }
  return vector;
}
