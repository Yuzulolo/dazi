"use client";

import { useEffect } from "react";
import Link from "next/link";
import { clearPlanDraft, draftBelongsTo, usePlanDraft } from "@/app/_components/dazi/plan-draft";

// The sentence typed on the homepage before signing up (FLOWS 1.1). Shown only to the
// person it belongs to; a draft from someone else on this browser is discarded (review W5).
export function ContinuePlan({ user }: { user: { id: string; accountCreatedAt: string } }) {
  const [draft] = usePlanDraft();
  const mine = draft !== null && draftBelongsTo(draft, user);
  useEffect(() => {
    if (draft && !mine) clearPlanDraft();
  }, [draft, mine]);
  if (!draft || !mine) return null;
  return (
    <div className="glass continue-plan">
      <p className="eyebrow">Continue with your plan</p>
      <p>“{draft.text}”</p>
      <Link className="primary-button" href="/posts/new">
        Make my poster ↗
      </Link>
    </div>
  );
}
