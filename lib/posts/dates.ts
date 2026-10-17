// Relative dates resolved in code, so the AI only copies them (models are unreliable
// at calendar maths: in the first eval run "next week" came back one day off).
// No imports, so `npm test` can load it directly (lib/posts/dates.test.mjs).

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shift(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// The next time a day and month (MM-DD) occurs on or after today.
export function nextOccurrence(monthDay: string, todayIso: string) {
  const year = Number(todayIso.slice(0, 4));
  const thisYear = `${year}-${monthDay}`;
  return thisYear >= todayIso ? thisYear : `${year + 1}-${monthDay}`;
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
  const past = shift(todayIso, -10);
  const future = shift(todayIso, 10);
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
