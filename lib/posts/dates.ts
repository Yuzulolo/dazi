// Relative dates resolved in code, so the AI only copies them (models are unreliable
// at calendar maths: in the first eval run "next week" came back one day off).
// No imports, so `npm test` can load it directly (lib/posts/dates.test.mjs).

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shift(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isValidIso(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function addYear(iso: string) {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}

function subtractYear(iso: string) {
  return `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
}

// The next time a day and month (MM-DD) occurs on or after today.
export function nextOccurrence(monthDay: string, todayIso: string) {
  const year = Number(todayIso.slice(0, 4));
  const thisYear = `${year}-${monthDay}`;
  return thisYear >= todayIso ? thisYear : `${year + 1}-${monthDay}`;
}

// The year rule, enforced in code after the AI answers (PR #5 review W3):
// - the whole trip already passed this year → it means next year ("Lisbon 3–5 Oct" on 17 Oct)
// - the trip is under way (started before today, ends today or later) → this year, starting today
//   ("Berlin 15–20 Oct" on 17 Oct → 17–20 Oct), because a new post can't start in the past
// - the model pushed an under-way trip to next year by mistake → back to this year
// Returns null when no valid range is left (e.g. 29 Feb rolled into a non-leap year).
export function normalizeTripDates(start: string, end: string, todayIso: string): [string, string] | null {
  if (!isValidIso(start) || !isValidIso(end) || end < start) return null;
  if (start > todayIso && subtractYear(start) < todayIso && subtractYear(end) >= todayIso) {
    start = subtractYear(start);
    end = subtractYear(end);
  }
  if (end < todayIso) {
    start = addYear(start);
    end = addYear(end);
    if (!isValidIso(start) || !isValidIso(end) || end < todayIso) return null;
  }
  if (start < todayIso) start = todayIso;
  return [start, end];
}

export type DateAnchors = {
  today: string;
  tomorrow: string;
  thisWeekend: [string, string];
  nextWeekend: [string, string];
  nextWeek: [string, string];
  pastExample: { label: string; date: string }; // a day/month that already passed → next year
  futureExample: { label: string; date: string }; // a day/month still ahead → this year
};

// "this weekend" = the coming Saturday–Sunday (from today if it is already the weekend);
// "next weekend" = the weekend after that; "next week" = Monday–Sunday of next calendar week.
export function dateAnchors(todayIso: string): DateAnchors {
  const weekday = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 = Sunday … 6 = Saturday
  const saturday = weekday === 0 ? shift(todayIso, -1) : shift(todayIso, 6 - weekday);
  const sunday = shift(saturday, 1);
  const thisWeekendStart = weekday === 0 || weekday === 6 ? todayIso : saturday;
  const nextMonday = shift(todayIso, ((8 - weekday) % 7) || 7);

  const label = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  // Example dates for the prompt; never 29 Feb, which may not exist next year (review S6).
  const pick = (days: number) => (shift(todayIso, days).slice(5) === "02-29" ? shift(todayIso, days + Math.sign(days)) : shift(todayIso, days));
  const past = pick(-10);
  const future = pick(10);
  return {
    today: todayIso,
    tomorrow: shift(todayIso, 1),
    thisWeekend: [thisWeekendStart, sunday],
    nextWeekend: [shift(saturday, 7), shift(sunday, 7)],
    nextWeek: [nextMonday, shift(nextMonday, 6)],
    pastExample: { label: label(past), date: nextOccurrence(past.slice(5), todayIso) },
    futureExample: { label: label(future), date: nextOccurrence(future.slice(5), todayIso) },
  };
}
