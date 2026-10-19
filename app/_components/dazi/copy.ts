import type { DialogContent } from "./types";

// Dialog texts used on several pages.

export const HOW_IT_WORKS: DialogContent = {
  title: "One sentence. A shared plan.",
  body: "Tell us where you’ll be and what you’d like to do. Browse similar plans, send an invite, and chat when you both say yes.",
};

export const SAFETY_TIPS: DialogContent = {
  title: "A good plan starts safely.",
  body: "Meet in public places first, tell someone your plans, and keep personal contact details private until you feel comfortable.",
};

// Shown when a guest submits the homepage composer (FLOWS 1.1).
export const SIGNUP_PROMPT: DialogContent = {
  title: "Turn this into your poster.",
  body: "Sign up (18+) and AI turns your sentence into a poster, then shows you real people with overlapping plans. Your sentence waits in this browser until then.",
};

export const CONNECT_DEMO: DialogContent = {
  eyebrow: "Demo profile",
  title: "A shared yes comes first.",
  body: "Create an account to send invites. Chat opens only when you both accept. This is a fictional demo profile, so no invite is sent.",
  signUp: true,
};
