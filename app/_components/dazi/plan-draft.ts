"use client";

import { useCallback, useSyncExternalStore } from "react";

// The guest's one-sentence plan, kept in this browser's localStorage so it survives the
// sign-up email-confirmation tab (FLOWS 1.1). Stored with a timestamp and ignored after
// 7 days; cleared when the first plan is published, on sign-out and on account deletion.
// Never sent anywhere until the signed-in user asks for an AI draft.

const KEY = "dazi:plan-draft:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CHANGE_EVENT = "dazi:plan-draft-change";

function read(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { text, savedAt } = JSON.parse(raw) as { text?: unknown; savedAt?: unknown };
    if (typeof text !== "string" || typeof savedAt !== "number" || Date.now() - savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return text;
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

export function savePlanDraft(text: string) {
  try {
    if (text.trim()) localStorage.setItem(KEY, JSON.stringify({ text, savedAt: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing is remembered, nothing breaks.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearPlanDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// [draft or null, save]. Renders null on the server and during hydration (no mismatch).
export function usePlanDraft(): [string | null, (text: string) => void] {
  const draft = useSyncExternalStore(subscribe, read, () => null);
  const save = useCallback((text: string) => savePlanDraft(text), []);
  return [draft, save];
}
