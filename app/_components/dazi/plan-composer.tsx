"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePlanDraft } from "./plan-draft";
import type { HomeViewer } from "./types";

// The homepage composer poster: "Your next plan" in one sentence. The sentence stays in
// this browser (plan-draft.ts) and submitting opens the sign-up prompt; after sign-up
// and onboarding it pre-fills the first plan (FLOWS 1.1). Full guest search: Roadmap.
// Signed-in members go straight to /posts/new (pre-filled), not-yet-onboarded users to
// /onboarding; only guests get the sign-up prompt. Signed-in state comes from the server.
export function PlanComposerContent({
  current,
  viewer,
  onGuestSubmit,
}: {
  current: boolean;
  viewer: HomeViewer;
  onGuestSubmit: () => void;
}) {
  const router = useRouter();
  const owner = viewer.status === "guest" ? null : viewer.userId;
  const [stored, storePlan] = usePlanDraft(owner);
  const storedPlan = stored && stored.owner === owner ? stored.text : null;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const plan = draft ?? storedPlan ?? "";
  const tab = current ? 0 : -1;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan.trim()) {
      setError("Tell us a little about your plan.");
      return;
    }
    setError("");
    storePlan(plan);
    if (viewer.status === "member") router.push("/posts/new");
    else if (viewer.status === "onboarding") router.push("/onboarding");
    else onGuestSubmit();
  }

  return (
    <>
      <p className="eyebrow composer-kicker">Good plans. Better company.</p>
      <h1>
        What&apos;s your<span>next plan?</span>
      </h1>
      <p className="composer-intro">One sentence — we&apos;ll find your buddy.</p>
      <form className="glass trip-input" onSubmit={submit} noValidate>
        <label htmlFor="trip-plan">YOUR NEXT PLAN</label>
        <textarea
          id="trip-plan"
          value={plan}
          onChange={(event) => {
            setDraft(event.target.value);
            storePlan(event.target.value);
          }}
          maxLength={500}
          placeholder="Berlin this weekend. Food & flea markets."
          disabled={!current}
          tabIndex={tab}
          aria-describedby={error ? "plan-error" : undefined}
          aria-invalid={error ? true : undefined}
        />
        <button className="send-button" type="submit" disabled={!current} tabIndex={tab} aria-label="Find my buddy">
          ↗
        </button>
      </form>
      {error && (
        <p id="plan-error" className="composer-error" role="alert">
          {error}
        </p>
      )}
      <p className="input-helper">After you sign up, AI (via OpenRouter) turns this sentence into your poster.</p>
      <p className="paper-privacy">Connect only when you both say yes.</p>
    </>
  );
}
