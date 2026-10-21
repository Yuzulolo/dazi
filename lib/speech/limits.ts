// Upload rules for speech input, shared by the mic button (browser) and the speech route
// (server, which enforces them). Chrome/Firefox record audio/webm, Safari/iPhone audio/mp4.
export const SPEECH_MAX_SECONDS = 45;
export const SPEECH_MAX_BYTES = 2 * 1024 * 1024;
export const SPEECH_TYPES = ["audio/webm", "audio/mp4"] as const;
export type SpeechType = (typeof SPEECH_TYPES)[number];

// "audio/webm;codecs=opus" → "audio/webm"; anything else → null.
export function speechType(mime: string): SpeechType | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  return (SPEECH_TYPES as readonly string[]).includes(base) ? (base as SpeechType) : null;
}

// The declared type is chosen by the browser, so the server also checks the file's first
// bytes: WebM starts with the EBML magic 1A 45 DF A3, MP4 has "ftyp" at byte 4.
export function looksLike(type: SpeechType, head: Uint8Array) {
  if (type === "audio/webm") return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

// Dictated text is added after what is already typed, within the textarea's limit.
export function appendTranscript(current: string, text: string, max: number) {
  const joined = current.trim() ? `${current.trimEnd()} ${text}` : text;
  return joined.slice(0, max);
}

export type SpeechResult =
  | { ok: true; text: string }
  | { ok: false; reason: "off" | "auth" | "too_large" | "bad_type" | "quota" | "empty" | "unavailable" };
