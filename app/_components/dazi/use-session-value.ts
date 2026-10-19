"use client";

import { useCallback, useSyncExternalStore } from "react";

// A value kept in this tab's sessionStorage, shared by every component that
// reads the same key. Renders null on the server and during hydration, then
// the stored value — no hydration mismatch. Storage can be unavailable
// (private mode, blocked site data); the page still works without it.

const CHANGE_EVENT = "dazi:session-change";

function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSessionValue(key: string | null): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  const setValue = useCallback(
    (next: string) => {
      if (!key) return;
      try {
        sessionStorage.setItem(key, next);
      } catch {
        // Storage unavailable: nothing is remembered, nothing breaks.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );
  return [value, setValue];
}

// Keys. (The guest's plan sentence lives in localStorage instead: plan-draft.ts.)
export const POSITION_KEY = "dazi:matches-position:v1";
