"use client";

import Link from "next/link";
import { usePlanDraft } from "@/app/_components/dazi/plan-draft";

// The sentence a guest typed on the homepage before signing up (FLOWS 1.1).
export function ContinuePlan() {
  const [draft] = usePlanDraft();
  if (!draft) return null;
  return (
    <div className="glass continue-plan">
      <p className="eyebrow">Continue with your plan</p>
      <p>“{draft}”</p>
      <Link className="primary-button" href="/posts/new">
        Make my poster ↗
      </Link>
    </div>
  );
}
