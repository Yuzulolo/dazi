"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { PostPoster } from "@/app/_components/dazi/post-poster";
import { InfoDialog } from "@/app/_components/dazi/info-dialog";
import { AIBadge } from "@/app/_components/dazi/primitives";
import { PLAN_KEY, useSessionValue } from "@/app/_components/dazi/use-session-value";
import { FormError } from "@/app/_components/profile-fields";
import { TRAVEL_INTERESTS } from "@/lib/profile/options";
import {
  BUDGETS,
  BUDGET_LABELS,
  HEADLINE_MAX,
  MAX_INTERESTS,
  RAW_TEXT_MAX,
  TONES,
  TONE_LABELS,
  VIBE_MAX,
  type Budget,
  type Tone,
  type TripCard,
} from "@/lib/posts/card";
import { extractTripAction, type PostFormState } from "./actions";

type Draft = TripCard & { rawText: string; aiAssisted: boolean };

const EMPTY_CARD: TripCard = {
  city: null,
  startDate: null,
  endDate: null,
  interests: [],
  budget: null,
  vibe: null,
  headline: ["", ""],
  tone: "mint",
};

const FALLBACK_NOTICES = {
  empty: "Tell us your plan in one sentence first.",
  quota: "You've reached today's limit of 20 AI actions — fill in your card below, or try again tomorrow.",
  ai: "We couldn't read that automatically — fill in your card below.",
};

// /posts/new and /posts/edit. Step 1 (new only): one sentence → AI draft.
// Step 2: the card as a live poster preview + editable fields → save.
export function PostEditor({
  mode,
  action,
  initial,
  hasActivePost = false,
}: {
  mode: "new" | "edit";
  action: (state: PostFormState, formData: FormData) => Promise<PostFormState>;
  initial?: Draft;
  hasActivePost?: boolean;
}) {
  const [storedPlan] = useSessionValue(mode === "new" ? PLAN_KEY : null);
  const [sentence, setSentence] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(initial ?? null);
  const [notice, setNotice] = useState("");
  const [extracting, startExtracting] = useTransition();
  const [state, formAction, saving] = useActionState(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmed = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // The guest's homepage sentence carries over (FLOWS 1.1.6).
  const text = sentence ?? storedPlan ?? "";

  function makePoster(useAi: boolean) {
    if (!useAi) {
      setNotice("");
      setDraft({ ...EMPTY_CARD, rawText: text.trim(), aiAssisted: false });
      return;
    }
    startExtracting(async () => {
      const result = await extractTripAction(text);
      if (result.ok) {
        setNotice("");
        setDraft({ ...result.card, rawText: result.rawText, aiAssisted: true });
      } else if (result.reason === "empty") {
        setNotice(FALLBACK_NOTICES.empty);
      } else {
        setNotice(FALLBACK_NOTICES[result.reason]);
        setDraft({ ...EMPTY_CARD, rawText: result.rawText, aiAssisted: false });
      }
    });
  }

  if (!draft) {
    return (
      <section className="glass calm-panel" data-width="narrow">
        <h1>Post your plan</h1>
        <p className="calm-lead">One sentence is enough. AI turns it into a poster you can edit.</p>
        <div className="dazi-form">
          <p className="field">
            <label htmlFor="sentence">Your plan</label>
            <textarea
              id="sentence"
              value={text}
              maxLength={RAW_TEXT_MAX}
              placeholder="I'm in Berlin 20–25 Oct, want street food and flea markets."
              onChange={(event) => setSentence(event.target.value)}
              aria-describedby="sentence-help"
            />
            <small id="sentence-help" className="field-help">
              English, German or Chinese. No phone numbers or emails — they are removed automatically.
            </small>
          </p>
          <FormError error={notice} />
          <button type="button" className="primary-button" disabled={extracting} onClick={() => makePoster(true)}>
            {extracting ? "Making your poster…" : "Make my poster ↗"}
          </button>
          <button type="button" className="text-button" onClick={() => makePoster(false)}>
            Skip AI — fill in the card myself
          </button>
        </div>
      </section>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const toggleInterest = (value: string) =>
    update({
      interests: draft.interests.includes(value)
        ? draft.interests.filter((v) => v !== value)
        : [...draft.interests, value],
    });

  return (
    <div className="post-editor">
      <div className="post-preview">
        <PostPoster {...draft} ai={draft.aiAssisted ? "draft" : null} eyebrow="Poster preview" />
        {draft.aiAssisted && (
          <p className="small-copy">
            <AIBadge /> AI filled in this card from your sentence. Check every field before saving.
          </p>
        )}
      </div>

      <section className="glass calm-panel">
        <h1>{mode === "new" ? "Your poster" : "Edit your plan"}</h1>
        {notice && <p className="form-error">{notice}</p>}
        <form
          ref={formRef}
          action={formAction}
          className="dazi-form"
          onSubmit={(event) => {
            // Replacing an active post archives it — confirm first (FLOWS 2.1).
            if (mode === "new" && hasActivePost && !confirmed.current) {
              event.preventDefault();
              setConfirmOpen(true);
            }
          }}
        >
          <input type="hidden" name="aiAssisted" value={String(draft.aiAssisted)} />
          <input type="hidden" name="tone" value={draft.tone} />

          <fieldset>
            <legend>Poster headline (two short lines)</legend>
            <div className="inline-fields">
              {([0, 1] as const).map((i) => (
                <p className="field" key={i}>
                  <label htmlFor={`headline${i + 1}`}>Line {i + 1}</label>
                  <input
                    id={`headline${i + 1}`}
                    name={`headline${i + 1}`}
                    required
                    maxLength={HEADLINE_MAX}
                    value={draft.headline[i]}
                    aria-describedby={`headline${i + 1}-count`}
                    onChange={(event) => {
                      const headline: [string, string] = [...draft.headline];
                      headline[i] = event.target.value;
                      update({ headline });
                    }}
                  />
                  <small id={`headline${i + 1}-count`} className="field-help">
                    {draft.headline[i].length} / {HEADLINE_MAX}
                  </small>
                </p>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Poster colour</legend>
            <div className="choice-group">
              {TONES.map((tone: Tone) => (
                <label key={tone} className="choice tone-choice">
                  <input
                    type="radio"
                    name="toneChoice"
                    value={tone}
                    checked={draft.tone === tone}
                    onChange={() => update({ tone })}
                  />
                  <span className="tone-swatch" data-tone={tone} aria-hidden="true" />
                  {TONE_LABELS[tone]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="inline-fields">
            <p className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" required maxLength={80} value={draft.city ?? ""} onChange={(e) => update({ city: e.target.value })} />
            </p>
            <p className="field">
              <label htmlFor="startDate">From</label>
              <input id="startDate" name="startDate" type="date" required value={draft.startDate ?? ""} onChange={(e) => update({ startDate: e.target.value || null })} />
            </p>
            <p className="field">
              <label htmlFor="endDate">To</label>
              <input id="endDate" name="endDate" type="date" required min={draft.startDate ?? undefined} value={draft.endDate ?? ""} onChange={(e) => update({ endDate: e.target.value || null })} />
            </p>
          </div>

          <fieldset>
            <legend>Interests (1–{MAX_INTERESTS})</legend>
            <div className="choice-group">
              {TRAVEL_INTERESTS.map((o) => (
                <label key={o.value} className="choice">
                  <input
                    type="checkbox"
                    name="interests"
                    value={o.value}
                    checked={draft.interests.includes(o.value)}
                    disabled={!draft.interests.includes(o.value) && draft.interests.length >= MAX_INTERESTS}
                    onChange={() => toggleInterest(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="inline-fields">
            <p className="field">
              <label htmlFor="budget">Budget</label>
              <select id="budget" name="budget" value={draft.budget ?? ""} onChange={(e) => update({ budget: (e.target.value || null) as Budget | null })}>
                <option value="">Not specified</option>
                {BUDGETS.map((b) => (
                  <option key={b} value={b}>
                    {BUDGET_LABELS[b]}
                  </option>
                ))}
              </select>
            </p>
            <p className="field">
              <label htmlFor="vibe">Vibe (optional)</label>
              <input id="vibe" name="vibe" maxLength={VIBE_MAX} value={draft.vibe ?? ""} placeholder="slow pace, relaxed mornings" onChange={(e) => update({ vibe: e.target.value || null })} />
            </p>
          </div>

          <p className="field">
            <label htmlFor="rawText">Your plan in your words</label>
            <textarea id="rawText" name="rawText" required maxLength={RAW_TEXT_MAX} value={draft.rawText} onChange={(e) => update({ rawText: e.target.value })} aria-describedby="rawText-help" />
            <small id="rawText-help" className="field-help">
              Shown to your matches. Phone numbers and emails are removed automatically.
            </small>
          </p>

          <FormError error={state.error} />
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving…" : mode === "new" ? "Publish my plan" : "Save changes"}
          </button>
          {mode === "new" && (
            <button type="button" className="text-button" onClick={() => setDraft(null)}>
              ← Start again from a sentence
            </button>
          )}
        </form>
      </section>

      {confirmOpen && (
        <InfoDialog
          content={{ title: "Replace your current plan?", body: "You can have one active plan. Your current one will be archived." }}
          onClose={() => setConfirmOpen(false)}
        >
          <div className="modal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                confirmed.current = true;
                setConfirmOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Replace my plan
            </button>
            <button type="button" className="outline-button" onClick={() => setConfirmOpen(false)}>
              Keep my current plan
            </button>
          </div>
        </InfoDialog>
      )}
    </div>
  );
}
