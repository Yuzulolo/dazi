"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { SPEECH_MAX_BYTES, SPEECH_MAX_SECONDS, SPEECH_TYPES, speechType, type SpeechResult } from "@/lib/speech/limits";

// Speech input for the plan composer (phase 8). Records up to 45 s with MediaRecorder, uploads
// to app/api/speech (ElevenLabs Scribe) and hands the text to the textarea. Only rendered for
// signed-in users while the server says speech is on. Typing always keeps working.
type Phase = "idle" | "starting" | "recording" | "sending";
type Failure = Extract<SpeechResult, { ok: false }>["reason"] | "unsupported" | "denied" | "nomic" | "busy" | "short";

const ERRORS: Record<Failure, string> = {
  unsupported: "Voice input isn't supported in this browser — please type your plan.",
  denied: "Microphone access was blocked. Allow it in your browser settings, or type your plan.",
  nomic: "No microphone found — please type your plan.",
  busy: "Your microphone is busy in another app — close it and try again, or type your plan.",
  short: "That was too short — hold on a moment longer, or type your plan.",
  too_large: "That recording is too long — try a shorter one, or type your plan.",
  bad_type: "Your browser recorded an audio format we can't read — please type your plan.",
  quota: "Voice input has reached today's limit — please type your plan, or try again tomorrow.",
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

function release(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function clearTimer(timer: RefObject<number | null>) {
  if (timer.current !== null) window.clearInterval(timer.current);
  timer.current = null;
}

// Stops the recorder without uploading and releases the microphone.
function discard(recorder: RefObject<MediaRecorder | null>, timer: RefObject<number | null>) {
  clearTimer(timer);
  const r = recorder.current;
  recorder.current = null;
  if (!r) return;
  r.onstop = null;
  if (r.state !== "inactive") r.stop();
  release(r.stream);
}

export function MicButton({
  onText,
  disabled = false,
  tabIndex,
}: {
  // Called with the transcript; the parent appends it to the CURRENT textarea value.
  onText: (text: string) => void;
  // Turning disabled while recording (poster swiped away, form submitted) discards the recording.
  disabled?: boolean;
  tabIndex?: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [transcribed, setTranscribed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false); // guards double clicks before the phase state updates
  // The latest onText, so text typed while recording isn't overwritten by a stale closure.
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  // Leaving the page mid-recording releases the microphone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard(recorder, timer);
    };
  }, []);

  useEffect(() => {
    if (disabled && recorder.current) {
      discard(recorder, timer);
      setPhase("idle");
      setAnnouncement("Recording cancelled.");
    }
  }, [disabled]);

  function fail(reason: Failure) {
    setPhase("idle");
    setError(ERRORS[reason]);
  }

  async function upload(blob: Blob) {
    if (!speechType(blob.type)) return fail("bad_type");
    if (blob.size < 1000) return fail("short");
    if (blob.size > SPEECH_MAX_BYTES) return fail("too_large");
    setPhase("sending");
    const form = new FormData();
    form.append("audio", blob, "recording");
    try {
      const res = await fetch("/api/speech", { method: "POST", body: form });
      const result = (await res.json()) as SpeechResult;
      if (!mounted.current) return;
      if (!result.ok) return fail(result.reason);
      onTextRef.current(result.text);
      setTranscribed(true);
      setPhase("idle");
      setAnnouncement("Transcribed. The text is in the box — check it before you send.");
    } catch {
      if (mounted.current) fail("unavailable");
    }
  }

  async function start() {
    if (phase !== "idle" || starting.current) return;
    setError("");
    const mime = pickMime();
    if (!mime) return fail("unsupported");
    setPhase("starting"); // disables the button while the permission prompt is open
    starting.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      starting.current = false;
      const name = e instanceof DOMException ? e.name : "";
      if (!mounted.current) return;
      if (name === "NotAllowedError" || name === "SecurityError") return fail("denied");
      if (name === "NotFoundError") return fail("nomic");
      return fail(name === "NotReadableError" || name === "AbortError" ? "busy" : "unsupported");
    }
    starting.current = false;
    if (!mounted.current) return release(stream);
    let r: MediaRecorder;
    try {
      // ~32 kbit/s keeps 45 s around 180 KB, far below the 2 MB limit.
      r = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
      r.start();
    } catch {
      release(stream);
      return fail("unsupported");
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    r.onstop = () => {
      clearTimer(timer);
      release(stream);
      recorder.current = null;
      setAnnouncement("Recording stopped. Transcribing…");
      void upload(new Blob(chunks, { type: r.mimeType || mime }));
    };
    recorder.current = r;
    setSeconds(0);
    setPhase("recording");
    setAnnouncement(`Recording started. Speak now — up to ${SPEECH_MAX_SECONDS} seconds.`);
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(Math.min(elapsed, SPEECH_MAX_SECONDS));
      if (elapsed >= SPEECH_MAX_SECONDS) stop(); // auto-stop
    }, 250);
  }

  function stop() {
    clearTimer(timer);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const recording = phase === "recording";

  return (
    <div className="speech-input">
      <div className="speech-row">
        <button
          type="button"
          className="mic-button"
          data-recording={recording || undefined}
          aria-pressed={recording}
          aria-label="Speak your plan (voice input)"
          disabled={(disabled && !recording) || phase === "starting" || phase === "sending"}
          tabIndex={tabIndex}
          onClick={recording ? stop : start}
        >
          <svg className="mic-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3"
            />
          </svg>
          <span>{phase === "sending" ? "Transcribing…" : "Speak"}</span>
        </button>
        {recording && (
          <>
            <button type="button" className="mic-button" data-stop tabIndex={tabIndex} onClick={stop}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
              </svg>
              <span>Stop</span>
            </button>
            <span className="speech-clock" aria-hidden="true">
              <span className="rec-dot" /> 0:{String(seconds).padStart(2, "0")} / 0:{SPEECH_MAX_SECONDS}
            </span>
          </>
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
