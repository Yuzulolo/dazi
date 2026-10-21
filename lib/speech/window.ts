// Automatic retirement of speech input (phase 8): it runs until SPEECH_UNTIL (a Berlin
// calendar date, "YYYY-MM-DD", inclusive) and switches itself off the day after. A missing
// or invalid date means off. Pure, so tests/speech-env.test.mjs can run it.
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function berlinToday(now: Date) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

export function withinSpeechWindow(until: string | undefined, now: Date) {
  const m = until ? DATE.exec(until.trim()) : null;
  if (!m) return false;
  // Reject impossible dates such as 2026-02-31.
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.toISOString().slice(0, 10) !== m[0]) return false;
  return berlinToday(now) <= m[0];
}
