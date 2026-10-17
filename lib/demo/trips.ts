import type { GuestTrip } from "@/app/_components/dazi/types";

// ---------------------------------------------------------------------------
// DEMO ONLY — FICTIONAL TRIPS. These people do not exist.
// Shown on /, /matches and /plans/[id] until real guest search arrives in
// part E. Every poster built from these carries a "Demo" badge, and the
// footer says no invites are sent. Set DEMO_MATCHES to false (or delete this
// file) once the pages get real, server-redacted results.
// ---------------------------------------------------------------------------
export const DEMO_MATCHES = true;

export const demoTrips: GuestTrip[] = [
  {
    id: "berlin-markets",
    tone: "lavender",
    headline: ["Flea markets.", "Good coffee."],
    city: "Berlin",
    dates: "20–22 Oct 2026",
    name: "M•••",
    ageRange: "25–29",
    languages: ["English", "German"],
    interests: ["Markets", "Cafés", "Photography"],
    pace: "Slow",
    budget: "Not specified",
    description: "A slow wander through Berlin’s weekend markets, with coffee and food stops along the way.",
    matchReason: "You both want food markets and unhurried days in Berlin.",
    overlap: "Three shared days in Berlin.",
  },
  {
    id: "berlin-food",
    tone: "forest",
    headline: ["Street food.", "Late nights."],
    city: "Berlin",
    dates: "21–24 Oct 2026",
    name: "A•••",
    ageRange: "30–34",
    languages: ["English"],
    interests: ["Food", "Nightlife"],
    pace: "Flexible",
    budget: "Not specified",
    description: "Looking for someone to try late-night food spots and see where the evening takes us.",
    matchReason: "You both want to explore Berlin’s food scene.",
    overlap: "Four shared days in Berlin.",
  },
  {
    id: "berlin-lake",
    tone: "pink",
    headline: ["A lake walk.", "No rush."],
    city: "Berlin",
    dates: "23–25 Oct 2026",
    name: "S•••",
    ageRange: "35–39",
    languages: ["English"],
    interests: ["Nature", "Easy pace"],
    pace: "Slow",
    budget: "Not specified",
    description: "A little fresh air, a lakeside walk and absolutely no packed schedule.",
    matchReason: "You both enjoy an easy pace and time outside.",
    overlap: "Three shared days in Berlin.",
  },
  {
    id: "berlin-cafes",
    tone: "mint",
    headline: ["Small cafés.", "Big ideas."],
    city: "Berlin",
    dates: "20–23 Oct 2026",
    name: "J•••",
    ageRange: "25–29",
    languages: ["English", "German"],
    interests: ["Cafés", "Photography"],
    pace: "Slow",
    budget: "Not specified",
    description: "Coffee, neighbourhood walks and a few photographs of the city’s quieter corners.",
    matchReason: "Your interests overlap around cafés and local life.",
    overlap: "Four shared days in Berlin.",
  },
  {
    id: "berlin-art",
    tone: "forest",
    headline: ["Art outside.", "Plans open."],
    city: "Berlin",
    dates: "22–25 Oct 2026",
    name: "R•••",
    ageRange: "18–24",
    languages: ["English"],
    interests: ["Street art", "Markets"],
    pace: "Flexible",
    budget: "Not specified",
    description: "Let’s follow the murals, find a flea market and make a day of it.",
    matchReason: "You both mention markets and exploring neighbourhoods.",
    overlap: "Four shared days in Berlin.",
  },
];

export function findDemoTrip(id: string) {
  return demoTrips.find((trip) => trip.id === id) ?? null;
}
