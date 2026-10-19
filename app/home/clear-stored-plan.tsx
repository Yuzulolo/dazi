"use client";

import { useEffect } from "react";
import { clearPlanDraft } from "@/app/_components/dazi/plan-draft";

// After a post is saved (or the account is deleted), the guest sentence has done its job.
export function ClearStoredPlan() {
  useEffect(() => {
    clearPlanDraft();
  }, []);
  return null;
}
