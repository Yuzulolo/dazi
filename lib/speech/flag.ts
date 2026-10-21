import "server-only";
import { withinSpeechWindow } from "./window.ts";

// Kill switch + automatic retirement for speech input (phase 8). Both server-only env vars:
// SPEECH_ENABLED must be exactly "true" AND today (Berlin) must be on or before SPEECH_UNTIL.
// Off = the mic is hidden and app/api/speech/route.ts refuses. tests/speech-env.test.mjs keeps
// these out of client code.
export function speechEnabled(now = new Date()) {
  return process.env.SPEECH_ENABLED === "true" && withinSpeechWindow(process.env.SPEECH_UNTIL, now);
}
