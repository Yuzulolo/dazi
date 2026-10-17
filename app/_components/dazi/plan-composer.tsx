"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PLAN_KEY, useSessionValue } from "./use-session-value";

// The homepage composer poster: "Your next plan" in one sentence.
// For now it opens the demo matches; real AI search is wired in parts C–E.
export function PlanComposerContent({ current }: { current: boolean }) {
  const router = useRouter();
  const [storedPlan, storePlan] = useSessionValue(PLAN_KEY);
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
    router.push("/matches");
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
      <p className="input-helper">Tell us your plan. Find your people.</p>
      <p className="paper-privacy">Connect only when you both say yes.</p>
    </>
  );
}
