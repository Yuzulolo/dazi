"use client";

import { useEffect } from "react";
import { PLAN_KEY } from "@/app/_components/dazi/use-session-value";

// After a post is saved, the guest sentence in sessionStorage has done its job.
export function ClearStoredPlan() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(PLAN_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }, []);
  return null;
}
