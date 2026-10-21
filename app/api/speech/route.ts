import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { speechEnabled } from "@/lib/speech/flag";
import { transcribe } from "@/lib/speech/elevenlabs";
import { SPEECH_MAX_BYTES, looksLike, speechType, type SpeechResult } from "@/lib/speech/limits";

// Speech input for the plan composer (phase 8): one recording → ElevenLabs Scribe → text.
// Order matters: kill switch, signed in, upload rules, THEN the quota slot, then the AI call —
// so a refused upload never costs a slot. The audio stays in memory; Dazi never stores it.
function reply(result: SpeechResult, status: number) {
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!speechEnabled()) return reply({ ok: false, reason: "off" }, 404);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return reply({ ok: false, reason: "auth" }, 401);

  // Refuse big bodies before reading them (multipart adds a little overhead).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > SPEECH_MAX_BYTES + 16 * 1024) return reply({ ok: false, reason: "too_large" }, 413);

  let file: FormDataEntryValue | null = null;
  try {
    file = (await request.formData()).get("audio");
  } catch {
    return reply({ ok: false, reason: "bad_type" }, 400);
  }
  if (!(file instanceof Blob)) return reply({ ok: false, reason: "bad_type" }, 400);
  if (file.size > SPEECH_MAX_BYTES) return reply({ ok: false, reason: "too_large" }, 413);
  const type = speechType(file.type);
  if (!type || file.size < 16 || !looksLike(type, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) {
    return reply({ ok: false, reason: "bad_type" }, 415);
  }

  // DB-enforced: 10 per user and 100 site-wide per rolling 24 h (consume_ai_quota, 'speech').
  const { data: allowed, error } = await supabase.rpc("consume_ai_quota", { p_kind: "speech" });
  if (error) {
    console.error("consume_ai_quota failed:", error.code);
    return reply({ ok: false, reason: "unavailable" }, 503);
  }
  if (allowed !== true) return reply({ ok: false, reason: "quota" }, 429);

  const text = await transcribe(file, type === "audio/mp4" ? "plan.m4a" : "plan.webm");
  if (text === null) return reply({ ok: false, reason: "unavailable" }, 502);
  if (!text) return reply({ ok: false, reason: "empty" }, 200);
  return reply({ ok: true, text }, 200);
}
