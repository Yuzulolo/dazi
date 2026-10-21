import "server-only";

// ElevenLabs speech-to-text, batch (not realtime): one recording in, one transcript out.
// Scribe v2 = model_id "scribe_v2" (https://elevenlabs.io/docs/api-reference/speech-to-text/convert).
// No language_code, so ElevenLabs detects the language (tested: English, German, Chinese).
// The audio is only passed through — Dazi never stores it. Never log the audio or the text.
export const SPEECH_MODEL = "scribe_v2";
const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

// Returns the transcript ("" if nothing was said), or null if ElevenLabs failed.
export async function transcribe(audio: Blob, filename: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error("transcribe: ELEVENLABS_API_KEY is not set");
    return null;
  }
  const body = new FormData();
  body.append("model_id", SPEECH_MODEL);
  body.append("tag_audio_events", "false"); // no "(laughter)" etc. in the plan text
  body.append("file", audio, filename);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": key },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error("transcribe: ElevenLabs returned", res.status);
      return null;
    }
    const data: unknown = await res.json();
    const text = data && typeof data === "object" && "text" in data ? data.text : null;
    return typeof text === "string" ? text.trim() : null;
  } catch (error) {
    console.error("transcribe: request failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
