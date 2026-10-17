// Fixed profile choices. The values MUST match the CHECK lists in
// supabase/migrations/20261016121716_profiles_onboarding_privacy.sql.

export type Option = { value: string; label: string };

export const LANGUAGES: Option[] = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "tr", label: "Turkish" },
  { value: "pl", label: "Polish" },
  { value: "nl", label: "Dutch" },
  { value: "hi", label: "Hindi" },
  { value: "uk", label: "Ukrainian" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
  { value: "el", label: "Greek" },
  { value: "vi", label: "Vietnamese" },
];

export const TRAVEL_INTERESTS: Option[] = [
  { value: "museums_galleries", label: "Museums & galleries" },
  { value: "history_architecture", label: "History & architecture" },
  { value: "nature_hiking", label: "Nature & hiking" },
  { value: "theme_parks", label: "Theme parks" },
  { value: "food_markets", label: "Food & markets" },
  { value: "cafes", label: "Cafés" },
  { value: "nightlife_bars", label: "Nightlife & bars" },
  { value: "shopping", label: "Shopping" },
  { value: "photography", label: "Photography" },
  { value: "local_hidden_spots", label: "Local life & hidden spots" },
  { value: "sports_outdoor", label: "Sports & outdoor" },
  { value: "festivals_concerts", label: "Festivals & concerts" },
];

export const DAY_RHYTHMS: Option[] = [
  { value: "early_bird", label: "Early bird" },
  { value: "flexible", label: "Flexible" },
  { value: "night_owl", label: "Night owl" },
];

// Travel pace 1–5 (SPEC §4.3).
export const TRAVEL_PACES: Option[] = [
  { value: "1", label: "1 · Every hour planned" },
  { value: "2", label: "2 · Mostly planned" },
  { value: "3", label: "3 · A bit of both" },
  { value: "4", label: "4 · Mostly spontaneous" },
  { value: "5", label: "5 · Go with the flow" },
];

// Gender is private: only used for matching, never shown (FLOWS 2.0b).
export const GENDERS: Option[] = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "other", label: "Other" },
];

export const PREF_GENDERS: Option[] = [
  { value: "woman", label: "Women" },
  { value: "man", label: "Men" },
  { value: "non_binary", label: "Non-binary people" },
];

export const GENDER_HELP =
  "Only used for matching, never shown. If you leave it empty, people who set a gender preference won't see you.";

export function labelOf(options: Option[], value: string | null | undefined) {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}

export function isOption(options: Option[], value: string) {
  return options.some((o) => o.value === value);
}
