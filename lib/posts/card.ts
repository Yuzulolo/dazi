// A trip card = the editable fields of a post. One set of rules for cleaning the
// AI's answer and for validating the form on save; they mirror the CHECKs in
// supabase/migrations/20261017160440_posts_ai.sql. Relative .ts imports so the
// eval script can run this with plain Node.
import { TRAVEL_INTERESTS } from "../profile/options.ts";
import { containsContactDetails, stripContactDetails } from "../profile/contact.ts";
import { normalizeTripDates } from "./dates.ts";

export const TONES = ["lavender", "forest", "mint", "pink"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABELS: Record<Tone, string> = {
  lavender: "Lavender · calm, cultural",
  forest: "Forest · food, evenings",
  mint: "Mint · fresh, outdoors",
  pink: "Pink · playful, social",
};

export const BUDGETS = ["low", "medium", "high"] as const;
export type Budget = (typeof BUDGETS)[number];
export const BUDGET_LABELS: Record<Budget, string> = { low: "Budget friendly", medium: "Medium", high: "Splurge" };

export const INTEREST_VALUES = TRAVEL_INTERESTS.map((o) => o.value);
export const MAX_INTERESTS = 5;
export const HEADLINE_MAX = 22;
export const RAW_TEXT_MAX = 500;
export const VIBE_MAX = 120;
export const MAX_TRIP_DAYS = 60;

export type TripCard = {
  city: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  interests: string[];
  budget: Budget | null;
  vibe: string | null;
  headline: [string, string];
  tone: Tone;
};

// Today in Berlin (relative dates like "this weekend" are resolved from this).
export function todayInBerlin(now = new Date()) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now); // YYYY-MM-DD
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "long" }).format(now);
  return { iso, weekday };
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

const isTone = (v: unknown): v is Tone => typeof v === "string" && (TONES as readonly string[]).includes(v);
const isBudget = (v: unknown): v is Budget => typeof v === "string" && (BUDGETS as readonly string[]).includes(v);

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max * 2) return null; // cap before the regex (review W1)
  const text = stripContactDetails(value.replace(/\s+/g, " ").trim());
  return text.length >= 1 && text.length <= max ? text : null;
}

function cleanInterests(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && INTEREST_VALUES.includes(v)))].slice(
    0,
    MAX_INTERESTS,
  );
}

function headlineLine(value: unknown): string | null {
  const line = cleanText(value, HEADLINE_MAX);
  return line && !line.includes("[contact removed]") ? line : null;
}

// Lenient: turns whatever the model returned into a safe card. Anything invalid
// becomes empty, so the user fills it in on the form.
export function cleanAiCard(raw: unknown, todayIso: string): TripCard {
  const r = (raw ?? {}) as Record<string, unknown>;
  const city = cleanText(r.city, 80);
  // The year rule is applied here in code, not trusted to the model (dates.ts).
  const range =
    isIsoDate(r.start_date) && isIsoDate(r.end_date) ? normalizeTripDates(r.start_date, r.end_date, todayIso) : null;
  const [startDate, endDate] =
    range && daysBetween(range[0], range[1]) <= MAX_TRIP_DAYS ? range : [null, null];
  const line1 = Array.isArray(r.headline) ? headlineLine(r.headline[0]) : null;
  const line2 = Array.isArray(r.headline) ? headlineLine(r.headline[1]) : null;
  const headline: [string, string] =
    line1 && line2 ? [line1, line2] : [city && city.length < HEADLINE_MAX ? `${city}.` : "New plan.", "Good company."];
  return {
    city,
    startDate,
    endDate,
    interests: cleanInterests(r.interests),
    budget: isBudget(r.budget) ? r.budget : null,
    vibe: cleanText(r.vibe, VIBE_MAX),
    headline,
    tone: isTone(r.tone) ? r.tone : "mint",
  };
}

export type PostInput = Omit<TripCard, "city" | "startDate" | "endDate"> & {
  rawText: string;
  city: string;
  startDate: string;
  endDate: string;
  aiAssisted: boolean;
};

// Strict: validates the form on save (never trust the client). Contact details are
// stripped from the free text before it is stored.
export function validatePostForm(
  formData: FormData,
  todayIso: string,
  { currentStartDate }: { currentStartDate?: string } = {}, // set when editing the active post
): { ok: true; post: PostInput } | { ok: false; error: string } {
  const editing = currentStartDate !== undefined;
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const typed = get("rawText").replace(/\s+/g, " ");
  // Length is checked BEFORE stripping (cheap regex input, review W1); the placeholder can
  // make the text a little longer, so the result is cut back to the limit (review S4).
  if (typed.length < 1 || typed.length > RAW_TEXT_MAX) {
    return { ok: false, error: `Please describe your plan in one sentence (up to ${RAW_TEXT_MAX} characters).` };
  }
  const rawText = stripContactDetails(typed).slice(0, RAW_TEXT_MAX).trim();
  const city = get("city").replace(/\s+/g, " ");
  if (city.length < 1 || city.length > 80) return { ok: false, error: "Please enter the city (up to 80 characters)." };
  // (every length check above/below runs before containsContactDetails, review W1)
  if (containsContactDetails(city)) return { ok: false, error: "Please remove contact details from the city." };

  const startDate = get("startDate");
  const endDate = get("endDate");
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return { ok: false, error: "Please choose your start and end dates." };
  if (endDate < startDate) return { ok: false, error: "The end date can't be before the start date." };
  // A trip that already started can still be edited while it hasn't ended, but its start
  // can't move further into the past (review W4; the database enforces the same).
  if (editing && endDate < todayIso) return { ok: false, error: "This trip has already ended." };
  const earliestStart = editing && currentStartDate < todayIso ? currentStartDate : todayIso;
  if (startDate < earliestStart) {
    return { ok: false, error: editing ? "The start date can't move further into the past." : "The start date can't be in the past." };
  }
  if (daysBetween(startDate, endDate) > MAX_TRIP_DAYS) {
    return { ok: false, error: `A plan can be at most ${MAX_TRIP_DAYS} days long.` };
  }

  const interests = cleanInterests(formData.getAll("interests").map(String));
  if (interests.length < 1) return { ok: false, error: "Please choose at least one interest." };
  if (formData.getAll("interests").length > MAX_INTERESTS) {
    return { ok: false, error: `Please choose at most ${MAX_INTERESTS} interests.` };
  }

  const budgetRaw = get("budget");
  if (budgetRaw && !isBudget(budgetRaw)) return { ok: false, error: "Please choose a budget from the list." };

  const vibeRaw = get("vibe");
  if (vibeRaw.length > VIBE_MAX) return { ok: false, error: `The vibe can be at most ${VIBE_MAX} characters.` };
  if (containsContactDetails(vibeRaw)) return { ok: false, error: "Please remove contact details from the vibe." };

  const line1 = get("headline1");
  const line2 = get("headline2");
  for (const line of [line1, line2]) {
    if (line.length < 1 || line.length > HEADLINE_MAX) {
      return { ok: false, error: `Each headline line needs 1–${HEADLINE_MAX} characters.` };
    }
    if (containsContactDetails(line)) return { ok: false, error: "Please remove contact details from the headline." };
  }

  const tone = get("tone");
  if (!isTone(tone)) return { ok: false, error: "Please pick a poster colour." };

  return {
    ok: true,
    post: {
      rawText,
      city,
      startDate,
      endDate,
      interests,
      budget: budgetRaw ? (budgetRaw as Budget) : null,
      vibe: vibeRaw || null,
      headline: [line1, line2],
      tone,
      aiAssisted: get("aiAssisted") === "true",
    },
  };
}
