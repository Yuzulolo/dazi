import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProfileFormValues } from "./types";

// Public columns only — birth_year, gender and pref_* are not readable through
// the table (column grants). The owner gets those via get_my_private_profile().
const MY_PUBLIC_COLUMNS =
  "display_name, languages, home_city, bio, visited_cities, hobbies, travel_pace, day_rhythm, travel_interests, onboarding_completed_at";

export type MyProfile = {
  values: ProfileFormValues;
  birthYear: number | null;
  basicsSaved: boolean; // onboarding step 1 done
  onboarded: boolean;
};

// Row returned by public.get_my_private_profile() (always the caller's own row).
type PrivateProfileRow = {
  birth_year: number | null;
  gender: string | null;
  pref_age_min: number;
  pref_age_max: number;
  pref_gender: string | null;
};

export async function getMyProfile(userId: string): Promise<MyProfile> {
  const supabase = await createClient();
  const [{ data: pub, error: pubError }, { data: privData, error: privError }] = await Promise.all([
    supabase.from("profiles").select(MY_PUBLIC_COLUMNS).eq("id", userId).single(),
    supabase.rpc("get_my_private_profile").single(),
  ]);
  const priv = privData as PrivateProfileRow | null;
  if (pubError || privError || !pub || !priv) {
    throw new Error(`Could not load profile: ${pubError?.code ?? privError?.code ?? "no row"}`);
  }

  return {
    values: {
      displayName: pub.display_name,
      gender: priv.gender ?? "",
      languages: pub.languages,
      homeCity: pub.home_city ?? "",
      bio: pub.bio ?? "",
      visitedCities: pub.visited_cities.join(", "),
      hobbies: pub.hobbies.join(", "),
      prefAgeMin: String(priv.pref_age_min),
      prefAgeMax: String(priv.pref_age_max),
      prefGender: priv.pref_gender ?? "",
      travelPace: pub.travel_pace === null ? "" : String(pub.travel_pace),
      dayRhythm: pub.day_rhythm ?? "",
      travelInterests: pub.travel_interests,
    },
    birthYear: priv.birth_year,
    basicsSaved: pub.languages.length > 0 && pub.home_city !== null,
    onboarded: pub.onboarding_completed_at !== null,
  };
}

export type PublicProfile = {
  id: string;
  displayName: string;
  ageRange: string | null;
  languages: string[];
  homeCity: string | null;
  bio: string | null;
  visitedCities: string[];
  hobbies: string[];
  travelPace: number | null;
  dayRhythm: string | null;
  travelInterests: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Another user's profile as signed-in users may see it (public_profiles view:
// age range only, no birth year / gender / preferences; onboarded users only).
export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  if (!UUID_PATTERN.test(id)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_profiles")
    .select(
      "id, display_name, age_range, languages, home_city, bio, visited_cities, hobbies, travel_pace, day_rhythm, travel_interests",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load public profile: ${error.code}`);
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    ageRange: data.age_range,
    languages: data.languages,
    homeCity: data.home_city,
    bio: data.bio,
    visitedCities: data.visited_cities,
    hobbies: data.hobbies,
    travelPace: data.travel_pace,
    dayRhythm: data.day_rhythm,
    travelInterests: data.travel_interests,
  };
}
