"use client";

import { useState, type FormEvent } from "react";
import { usePlanDraft } from "./plan-draft";

// The homepage composer poster: "Your next plan" in one sentence. The sentence stays in
// this browser (plan-draft.ts) and submitting opens the sign-up prompt; after sign-up
// and onboarding it pre-fills the first plan (FLOWS 1.1). Full guest search: Roadmap.
export function PlanComposerContent({ current, onSubmitted }: { current: boolean; onSubmitted: () => void }) {
  const [storedPlan, storePlan] = usePlanDraft();
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
    onSubmitted();
  }

  return (
    <>
      <div className="paper-wordmark" aria-hidden="true">
        dazi
      </div>
      <h1>
        Good plans.<span>Better company.</span>
      </h1>
      <p className="composer-intro">Find someone to share the little things.</p>
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
