import "server-only";
import {
  DAY_RHYTHMS,
  GENDERS,
  LANGUAGES,
  PREF_GENDERS,
  TRAVEL_INTERESTS,
  isOption,
  type Option,
} from "./options";
import { containsContactDetails } from "./contact";
import type { ProfileFormValues } from "./types";

// Column updates for public.profiles (snake_case = database names).
export type BasicsUpdate = {
  display_name: string;
  gender: string | null;
  languages: string[];
  home_city: string;
  bio: string | null;
  visited_cities: string[];
  hobbies: string[];
  pref_age_min: number;
  pref_age_max: number;
  pref_gender: string | null;
};

export type StyleUpdate = {
  travel_pace: number;
  day_rhythm: string;
  travel_interests: string[];
};

type Result<T> = { ok: true; update: T } | { ok: false; error: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

// Everything the form sent, as strings, so it can be echoed back after an error.
export function readFormValues(formData: FormData): ProfileFormValues {
  return {
    displayName: text(formData, "displayName"),
    gender: text(formData, "gender"),
    languages: formData.getAll("languages").map(String),
    homeCity: text(formData, "homeCity"),
    bio: text(formData, "bio"),
    visitedCities: text(formData, "visitedCities"),
    hobbies: text(formData, "hobbies"),
    prefAgeMin: text(formData, "prefAgeMin"),
    prefAgeMax: text(formData, "prefAgeMax"),
    prefGender: text(formData, "prefGender"),
    travelPace: text(formData, "travelPace"),
    dayRhythm: text(formData, "dayRhythm"),
    travelInterests: formData.getAll("travelInterests").map(String),
  };
}

// "Berlin, Paris, berlin" -> ["Berlin", "Paris"] (trimmed, case-insensitive de-dupe).
export function splitList(value: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value.split(",")) {
    const item = raw.trim().replace(/\s+/g, " ");
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      items.push(item);
    }
  }
  return items;
}

function pickAll(values: string[], options: Option[]) {
  return [...new Set(values)].filter((v) => isOption(options, v));
}

const NO_CONTACTS = "Please remove contact details (email or phone number)";

// Shared by sign-up and the profile forms.
export function parseDisplayName(value: string): string | null {
  if (value.length < 1 || value.length > 50) return "Please enter a display name (1–50 characters).";
  if (containsContactDetails(value)) return `${NO_CONTACTS} from your display name.`;
  return null;
}

export function parseBasics(v: ProfileFormValues): Result<BasicsUpdate> {
  const nameError = parseDisplayName(v.displayName);
  if (nameError) return { ok: false, error: nameError };
  if (v.gender && !isOption(GENDERS, v.gender)) {
    return { ok: false, error: "Please choose a gender from the list, or leave it empty." };
  }

  const languages = pickAll(v.languages, LANGUAGES);
  if (languages.length < 1) return { ok: false, error: "Please choose at least one language you speak." };
  if (languages.length > 10) return { ok: false, error: "Please choose at most 10 languages." };

  if (v.homeCity.length < 1 || v.homeCity.length > 80) {
    return { ok: false, error: "Please enter your home city (up to 80 characters)." };
  }
  if (containsContactDetails(v.homeCity)) return { ok: false, error: `${NO_CONTACTS} from your home city.` };

  if (v.bio.length > 500) return { ok: false, error: "Your bio can be at most 500 characters." };
  if (containsContactDetails(v.bio)) {
    return { ok: false, error: `${NO_CONTACTS} from your bio.` };
  }

  const visitedCities = splitList(v.visitedCities);
  if (visitedCities.length > 50 || visitedCities.some((c) => c.length > 80)) {
    return { ok: false, error: "Cities visited: up to 50 cities, each up to 80 characters." };
  }
  if (visitedCities.some(containsContactDetails)) {
    return { ok: false, error: `${NO_CONTACTS} from your cities visited.` };
  }
  const hobbies = splitList(v.hobbies);
  if (hobbies.length > 20 || hobbies.some((h) => h.length > 30)) {
    return { ok: false, error: "Hobbies: up to 20 hobbies, each up to 30 characters." };
  }
  if (hobbies.some(containsContactDetails)) return { ok: false, error: `${NO_CONTACTS} from your hobbies.` };

  const prefAgeMin = Number(v.prefAgeMin);
  const prefAgeMax = Number(v.prefAgeMax);
  if (
    !Number.isInteger(prefAgeMin) || !Number.isInteger(prefAgeMax) ||
    prefAgeMin < 18 || prefAgeMax > 99 || prefAgeMin > prefAgeMax
  ) {
    return { ok: false, error: "Preferred buddy age: two whole numbers from 18 to 99, the first not larger than the second." };
  }
  if (v.prefGender && !isOption(PREF_GENDERS, v.prefGender)) {
    return { ok: false, error: "Please choose a gender preference from the list, or 'Anyone'." };
  }

  return {
    ok: true,
    update: {
      display_name: v.displayName,
      gender: v.gender || null,
      languages,
      home_city: v.homeCity,
      bio: v.bio || null,
      visited_cities: visitedCities,
      hobbies,
      pref_age_min: prefAgeMin,
      pref_age_max: prefAgeMax,
      pref_gender: v.prefGender || null,
    },
  };
}

export function parseStyle(v: ProfileFormValues): Result<StyleUpdate> {
  const travelPace = Number(v.travelPace);
  if (!Number.isInteger(travelPace) || travelPace < 1 || travelPace > 5) {
    return { ok: false, error: "Please choose your travel pace (1–5)." };
  }
  if (!isOption(DAY_RHYTHMS, v.dayRhythm)) {
    return { ok: false, error: "Please choose your day rhythm." };
  }
  const travelInterests = pickAll(v.travelInterests, TRAVEL_INTERESTS);
  if (travelInterests.length < 1) {
    return { ok: false, error: "Please choose at least one travel interest." };
  }
  return { ok: true, update: { travel_pace: travelPace, day_rhythm: v.dayRhythm, travel_interests: travelInterests } };
}

// A saved profile row as form values (used to show what was actually stored,
// e.g. "Berlin, berlin" comes back as "Berlin").
export type ProfileRow = {
  display_name: string;
  gender: string | null;
  languages: string[];
  home_city: string | null;
  bio: string | null;
  visited_cities: string[];
  hobbies: string[];
  pref_age_min: number;
  pref_age_max: number;
  pref_gender: string | null;
  travel_pace: number | null;
  day_rhythm: string | null;
  travel_interests: string[];
};

export function toFormValues(row: ProfileRow): ProfileFormValues {
  return {
    displayName: row.display_name,
    gender: row.gender ?? "",
    languages: row.languages,
    homeCity: row.home_city ?? "",
    bio: row.bio ?? "",
    visitedCities: row.visited_cities.join(", "),
    hobbies: row.hobbies.join(", "),
    prefAgeMin: String(row.pref_age_min),
    prefAgeMax: String(row.pref_age_max),
    prefGender: row.pref_gender ?? "",
    travelPace: row.travel_pace === null ? "" : String(row.travel_pace),
    dayRhythm: row.day_rhythm ?? "",
    travelInterests: row.travel_interests,
  };
}

// Strict 18+ rule, same as sign-up (birth year <= current year - 19).
export function parseBirthYear(raw: string): { ok: true; year: number } | { ok: false; error: string } {
  if (!/^\d{4}$/.test(raw) || Number(raw) < 1900) {
    return { ok: false, error: "Please enter your birth year as 4 digits, e.g. 1995." };
  }
  if (Number(raw) > new Date().getFullYear() - 19) {
    return { ok: false, error: "You must be 18 or older to use Dazi." };
  }
  return { ok: true, year: Number(raw) };
}
