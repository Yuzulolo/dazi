"use client";

import { useEffect, useRef, useState } from "react";
import { SPEECH_MAX_BYTES, SPEECH_MAX_SECONDS, SPEECH_TYPES, speechType, type SpeechResult } from "@/lib/speech/limits";

// Speech input for the plan composer (phase 8). Records up to 45 s with MediaRecorder, uploads
// to app/api/speech (ElevenLabs Scribe) and hands the text to the textarea. Only rendered for
// signed-in users while the server says speech is on. Typing always keeps working.
type Phase = "idle" | "recording" | "sending";

const ERRORS: Record<string, string> = {
  unsupported: "Voice input isn't supported in this browser — please type your plan.",
  denied: "Microphone access was blocked. Allow it in your browser settings, or type your plan.",
  nomic: "No microphone found — please type your plan.",
  short: "That was too short — hold on a moment longer, or type your plan.",
  too_large: "That recording is too long — try a shorter one, or type your plan.",
  bad_type: "Your browser recorded an audio format we can't read — please type your plan.",
  quota: "You've used today's 10 voice inputs — please type your plan, or try again tomorrow.",
  empty: "We didn't catch any words — try again, or type your plan.",
  unavailable: "Voice input isn't available right now — please type your plan.",
  off: "Voice input has been switched off — please type your plan.",
  auth: "Please sign in again to use voice input.",
};

// Chrome/Firefox → webm (opus), Safari/iPhone → mp4. null = this browser can't do it.
function pickMime() {
  if (typeof window === "undefined" || !window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) return null;
  const candidates = ["audio/webm;codecs=opus", ...SPEECH_TYPES];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function MicButton({
  onText,
  disabled = false,
  tabIndex,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  tabIndex?: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    timers.current.forEach((id) => window.clearInterval(id));
    timers.current = [];
  }

  // Leaving the page mid-recording releases the microphone.
  useEffect(
    () => () => {
      clearTimers();
      const r = recorder.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
      r?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function upload(blob: Blob) {
    const type = speechType(blob.type);
    if (!type) return fail("bad_type");
    if (blob.size < 1000) return fail("short");
    if (blob.size > SPEECH_MAX_BYTES) return fail("too_large");
    setPhase("sending");
    const form = new FormData();
    form.append("audio", blob, type === "audio/mp4" ? "plan.m4a" : "plan.webm");
    try {
      const res = await fetch("/api/speech", { method: "POST", body: form });
      const result = (await res.json()) as SpeechResult;
      if (!result.ok) return fail(result.reason);
      onText(result.text);
      setTranscribed(true);
      setPhase("idle");
      setAnnouncement("Transcribed. The text is in the box — check it before you send.");
    } catch {
      fail("unavailable");
    }
  }

  function fail(reason: string) {
    setPhase("idle");
    setError(ERRORS[reason] ?? ERRORS.unavailable);
  }

  async function start() {
    setError("");
    const mime = pickMime();
    if (!mime) return fail("unsupported");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      return fail(name === "NotFoundError" ? "nomic" : name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
    // ~32 kbit/s keeps 45 s around 180 KB, far below the 2 MB limit.
    const r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    r.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    r.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setAnnouncement("Recording stopped. Transcribing…");
      void upload(new Blob(chunks, { type: r.mimeType || mime }));
    };
    recorder.current = r;
    r.start();
    setSeconds(0);
    setPhase("recording");
    setAnnouncement(`Recording started. Speak now — up to ${SPEECH_MAX_SECONDS} seconds.`);
    const startedAt = Date.now();
    timers.current.push(
      window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(elapsed, SPEECH_MAX_SECONDS));
        if (elapsed >= SPEECH_MAX_SECONDS) stop(); // auto-stop
      }, 250),
    );
  }

  function stop() {
    clearTimers();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const recording = phase === "recording";
  const clock = `0:${String(seconds).padStart(2, "0")} / 0:${SPEECH_MAX_SECONDS}`;

  return (
    <div className="speech-input">
      <div className="speech-row">
        <button
          type="button"
          className="mic-button"
          data-recording={recording || undefined}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording" : "Speak your plan (voice input)"}
          disabled={disabled || phase === "sending"}
          tabIndex={tabIndex}
          onClick={recording ? stop : start}
        >
          <svg className="mic-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            {recording ? (
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            ) : (
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3"
              />
            )}
          </svg>
          <span>{recording ? "Stop" : phase === "sending" ? "Transcribing…" : "Speak"}</span>
        </button>
        {recording && (
          <span className="speech-clock" aria-hidden="true">
            <span className="rec-dot" /> {clock}
          </span>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && (
        <p className="speech-error" role="alert">
          {error}
        </p>
      )}
      {transcribed && !error && <p className="speech-label">Transcribed by ElevenLabs Scribe (AI) — please check it.</p>}
    </div>
  );
}
