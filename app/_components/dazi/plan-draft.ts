"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// The one-sentence plan typed on the homepage, kept only in this browser (localStorage) so
// it survives the sign-up email-confirmation tab (FLOWS 1.1). Stored with its time and its
// owner, ignored after 7 days, cleared on publish, sign-out and account deletion.
// Whose is it? (review W5 — shared computers)
//   - typed while signed in → owner = that user's id; only that user sees it again;
//   - typed as a guest → owner = null; it only carries over into an account created AFTER it
//     was typed (the person who just signed up), never into someone else's older account.

const KEY = "dazi:plan-draft:v2";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CHANGE_EVENT = "dazi:plan-draft-change";

export type PlanDraft = { text: string; savedAt: number; owner: string | null };

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): PlanDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<PlanDraft>;
    if (typeof d.text !== "string" || typeof d.savedAt !== "number" || Date.now() - d.savedAt > MAX_AGE_MS) return null;
    return { text: d.text, savedAt: d.savedAt, owner: typeof d.owner === "string" ? d.owner : null };
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs (e.g. the confirmation tab)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function savePlanDraft(text: string, owner: string | null) {
  try {
    if (text.trim()) localStorage.setItem(KEY, JSON.stringify({ text, savedAt: Date.now(), owner }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing is remembered, nothing breaks.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearPlanDraft() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("dazi:plan-draft:v1"); // earlier format, no owner
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Does this draft belong to the signed-in user?
export function draftBelongsTo(draft: PlanDraft, user: { id: string; accountCreatedAt: string }) {
  if (draft.owner !== null) return draft.owner === user.id;
  return Date.parse(user.accountCreatedAt) >= draft.savedAt; // guest draft → only a newer account
}

// [draft or null, save]. Renders null on the server and during hydration (no mismatch).
export function usePlanDraft(owner: string | null = null): [PlanDraft | null, (text: string) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const draft = useMemo(() => parse(raw), [raw]);
  const save = useCallback((text: string) => savePlanDraft(text, owner), [owner]);
  return [draft, save];
}
