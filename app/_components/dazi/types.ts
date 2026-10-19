// Shared types for the Dazi design system (docs/DESIGN.md).

import type { Tone } from "@/lib/posts/card";

// The four poster tones (defined once in lib/posts/card.ts) — also the post covers (SPEC §0.2 C).
export type { Tone };

// A recruitment poster as a guest may see it. Guest-safe fields only: the
// server redacts everything else (no full name, face, exact age, hidden
// preferences or contact details) before it reaches the browser.
export type GuestTrip = {
  id: string;
  tone: Tone;
  headline: [string, string]; // two-line poster headline, e.g. "Flea markets." / "Good coffee."
  city: string;
  dates: string;
  name: string; // initial only, e.g. "M•••"
  ageRange: string;
  languages: string[];
  interests: string[];
  pace: string;
  budget: string;
  description: string; // written by the trip's author
  matchReason: string; // AI-generated
  overlap: string; // AI-generated
};

export type DialogContent = {
  title: string;
  body: string;
  eyebrow?: string;
  signUp?: boolean; // show "Sign up" / "Not now" instead of "Got it"
};

// Who is looking at the homepage, decided on the server (lib/auth.ts getViewer).
export type HomeViewer = { status: "guest" } | { status: "onboarding" | "member"; userId: string };
