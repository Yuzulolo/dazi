// Speech input (phase 8): the ElevenLabs key, the kill switch and the retirement date are
// server-only env vars, read in exactly one server-only file each. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { withinSpeechWindow, berlinToday } from "../lib/speech/window.ts";
import { appendTranscript, looksLike, speechType } from "../lib/speech/limits.ts";

const root = new URL("..", import.meta.url).pathname;

async function files(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const READERS = {
  ELEVENLABS_API_KEY: join("lib", "speech", "elevenlabs.ts"),
  SPEECH_ENABLED: join("lib", "speech", "flag.ts"),
  SPEECH_UNTIL: join("lib", "speech", "flag.ts"),
};

test("speech env vars are never NEXT_PUBLIC_ and only read in their server-only file", async () => {
  for (const file of [...(await files("app")), ...(await files("lib"))]) {
    const source = await readFile(join(root, file), "utf8");
    assert.ok(!/NEXT_PUBLIC_(ELEVENLABS|SPEECH)/.test(source), `${file} must not expose speech env vars`);
    for (const [name, reader] of Object.entries(READERS)) {
      if (file !== reader) assert.ok(!source.includes(`process.env.${name}`), `${file} must not read ${name}`);
    }
  }
  for (const reader of new Set(Object.values(READERS))) {
    const source = await readFile(join(root, reader), "utf8");
    assert.match(source, /^import "server-only";/, `${reader} must be server-only`);
  }
  const flag = await readFile(join(root, READERS.SPEECH_ENABLED), "utf8");
  assert.match(flag, /process\.env\.SPEECH_ENABLED === "true"/, 'only the exact string "true" switches it on');
});

test("the speech route checks the kill switch first and takes a quota slot before calling ElevenLabs", async () => {
  const source = await readFile(join(root, "app", "api", "speech", "route.ts"), "utf8");
  const body = source.slice(source.indexOf("export async function POST"));
  const at = (s) => body.indexOf(s);
  assert.ok(at("speechEnabled()") > 0 && at("speechEnabled()") < at("getClaims"), "kill switch before anything else");
  assert.ok(at("getClaims") < at('p_kind: "speech"'), "signed-in check before the quota");
  assert.ok(at('p_kind: "speech"') < at("transcribe("), "quota before the AI call");
});

test("SPEECH_UNTIL: inclusive Berlin date; missing or invalid = off", () => {
  const until = "2026-11-21";
  assert.equal(withinSpeechWindow(until, new Date("2026-11-21T22:59:00Z")), true, "23:59 Berlin on the last day");
  assert.equal(withinSpeechWindow(until, new Date("2026-11-21T23:00:00Z")), false, "00:00 Berlin the day after");
  assert.equal(withinSpeechWindow(until, new Date("2026-10-21T10:00:00Z")), true);
  assert.equal(withinSpeechWindow(undefined, new Date()), false);
  assert.equal(withinSpeechWindow("", new Date()), false);
  assert.equal(withinSpeechWindow("21.11.2026", new Date()), false);
  assert.equal(withinSpeechWindow("2026-02-31", new Date("2026-01-01T00:00:00Z")), false);
  // "Yesterday" switches it off (the browser test does this with the env var).
  const yesterday = new Date(Date.now() - 86_400_000);
  assert.equal(withinSpeechWindow(berlinToday(yesterday), new Date()), false);
});

test("upload rules: webm + mp4 only, checked by magic bytes too", () => {
  assert.equal(speechType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(speechType("audio/mp4"), "audio/mp4");
  assert.equal(speechType("video/mp4"), null);
  assert.equal(speechType("text/plain"), null);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(looksLike("audio/webm", webm), true);
  assert.equal(looksLike("audio/mp4", mp4), true);
  assert.equal(looksLike("audio/webm", mp4), false);
  assert.equal(looksLike("audio/mp4", new TextEncoder().encode("hello world!")), false);
});

test("dictated text is appended within the limit", () => {
  assert.equal(appendTranscript("", "Berlin next week", 500), "Berlin next week");
  assert.equal(appendTranscript("Hi ", "Berlin", 500), "Hi Berlin");
  assert.equal(appendTranscript("abc", "defgh", 6), "abc de");
});
