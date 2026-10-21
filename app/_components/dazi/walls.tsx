"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { InfoDialog, InfoButton } from "./info-dialog";
import { PlanComposerContent } from "./plan-composer";
import { PosterCarousel, type CarouselItem } from "./poster-carousel";
import { TripPosterContent } from "./trip-poster";
import { AIBadge, DemoBadge, Headline, Identity, Paper, Tags } from "./primitives";
import { POSITION_KEY } from "./use-session-value";
import { usePlanDraft } from "./plan-draft";
import { CONNECT_DEMO, SAFETY_TIPS, SIGNUP_PROMPT } from "./copy";
import { DemoButton } from "./auth-buttons";
import type { DialogContent, GuestTrip, HomeViewer } from "./types";

// `demo` is required on purpose: fictional fixtures must always be labelled,
// and a page without demo data shows real (server-redacted) trips or nothing.

function tripItems(trips: GuestTrip[], demo: boolean, connect: () => void): CarouselItem[] {
  return trips.map((trip) => ({
    key: trip.id,
    tone: trip.tone,
    label: trip.headline.join(" "),
    content: (current) => <TripPosterContent trip={trip} current={current} demo={demo} onConnect={connect} />,
  }));
}

function connectContent(demo: boolean): DialogContent {
  // Real invites arrive in part F; until then Connect always leads to sign-up.
  return demo ? CONNECT_DEMO : { ...CONNECT_DEMO, eyebrow: undefined, body: "Create an account to send an invite. Chat opens only when you both accept." };
}

// Homepage: the composer poster first, then the wall of plans.
export function HomeWall({
  trips,
  demo,
  viewer,
  speech = false,
}: {
  trips: GuestTrip[];
  demo: boolean;
  viewer: HomeViewer;
  speech?: boolean;
}) {
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const [prompt, setPrompt] = useState(false);
  const items: CarouselItem[] = [
    {
      key: "composer",
      tone: "mint",
      label: "Your next plan",
      className: "composer",
      content: (current) => <PlanComposerContent current={current} viewer={viewer} speech={speech} onGuestSubmit={() => setPrompt(true)} />,
    },
    ...tripItems(trips, demo, () => setDialog(connectContent(demo))),
  ];

  return (
    <>
      <div className="wall-caption">
        A WALL OF LITTLE PLANS{" "}
        {demo && viewer.status === "guest" && <span>DESIGN DEMO · FICTIONAL TRIPS</span>}
        {demo && viewer.status === "member" && (
          <Link className="text-button caption-demo" href="/matches">
            Example posters — your real matches are on Matches →
          </Link>
        )}
        {viewer.status === "guest" && <DemoButton className="text-button caption-demo" label="Try the demo account ↗" />}
      </div>
      <PosterCarousel items={items} />
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
      {prompt && (
        <InfoDialog content={SIGNUP_PROMPT} onClose={() => setPrompt(false)}>
          <div className="modal-actions">
            <Link className="primary-button" href="/signup">
              Sign up
            </Link>
            <DemoButton />
            <Link className="text-button" href="/matches">
              See example matches
            </Link>
          </div>
        </InfoDialog>
      )}
    </>
  );
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// Guest results: the plan summary, then the matching posters.
export function MatchesWall({ trips, demo }: { trips: GuestTrip[]; demo: boolean }) {
  const [planDraft, savePlan] = usePlanDraft();
  const plan = planDraft?.text ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    savePlan(draft.trim());
    setEditing(false);
  }
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const count = trips.length;
  const countWord = COUNT_WORDS[count] ?? String(count);

  return (
    <>
      <div className="results-experience">
      <div className="results-intro">
        <div className="glass plan-summary">
          <div>
            <span className="eyebrow">Your plan</span>
            {demo && <DemoBadge>Demo matches</DemoBadge>}
            <p>{plan?.trim() || "Example plan: Berlin · 20–25 Oct · Food & markets · Slow pace"}</p>
          </div>
          <button className="outline-button" type="button" onClick={() => { setDraft(plan ?? ""); setEditing(true); }}>
            ✎ Edit plan
          </button>
        </div>
        <div className="results-heading">
          <h1>{count ? `${countWord} ${count === 1 ? "plan" : "plans"}. A little common ground.` : "No buddies yet for these dates."}</h1>
          {demo && <p className="demo-copy">Fictional examples · Not matched to your input. AI explanations illustrate a sample Berlin trip.</p>}
        </div>
      </div>
      {count ? (
        <PosterCarousel items={tripItems(trips, demo, () => setDialog(connectContent(demo)))} positionKey={POSITION_KEY} />
      ) : (
        <div className="empty-state glass">
          <p>Try a wider date range or change your plan.</p>
          <Link className="primary-button" href="/">
            Edit my plan
          </Link>
        </div>
      )}
      {editing && <InfoDialog content={{ title: "Your next plan", body: "Edit your sentence. Live matching is not connected; the demo posters will stay the same." }} onClose={() => setEditing(false)}>
        <form className="plan-editor" onSubmit={updatePlan}>
          <label htmlFor="edit-plan">Where, when, and what would you like to do?</label>
          <textarea id="edit-plan" autoFocus required maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className="primary-button" type="submit">Save plan</button>
        </form>
      </InfoDialog>}
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
      </div>
    </>
  );
}

// Recruitment detail: the poster opened up, plus why it fits.
export function PlanDetail({ trip, demo }: { trip: GuestTrip; demo: boolean }) {
  const [dialog, setDialog] = useState<DialogContent | null>(null);

  return (
    <>
      <div className="detail-back">
        <Link href="/matches">← Back to matches</Link>
      </div>
      <div className="detail-layout">
        <Paper tone={trip.tone} className="detail-paper">
          <p className="eyebrow">{demo ? "Demo recruitment" : "Recruitment"}</p>
          <Headline lines={trip.headline} as="h1" />
          <p className="trip-date">
            {trip.city} · {trip.dates}
          </p>
          <Identity trip={trip} />
          <section className="detail-section">
            <h2>The plan</h2>
            <p className="authored-label">{demo ? "Fictional author’s plan" : "Written by the author"}</p>
            <p>{trip.description}</p>
          </section>
          <dl className="trip-facts">
            <div>
              <dt>DATES</dt>
              <dd>{trip.dates}</dd>
            </div>
            <div>
              <dt>PACE</dt>
              <dd>{trip.pace}</dd>
            </div>
            <div>
              <dt>BUDGET</dt>
              <dd>{trip.budget}</dd>
            </div>
          </dl>
          <section className="detail-section">
            <h2>Interests</h2>
            <Tags values={trip.interests} label="Interests" />
          </section>
        </Paper>
        <aside className="glass detail-glass">
          <h2>Why this plan fits</h2>
          {demo ? <span className="rule-badge">Example reason (illustrative)</span> : <AIBadge />}
          {demo && <p className="small-copy">Illustrative AI explanation for the sample Berlin trip, not an analysis of your input.</p>}
          <dl className="match-facts">
            <div>
              <dt>Dates</dt>
              <dd>{trip.overlap}</dd>
            </div>
            <div>
              <dt>Interests</dt>
              <dd>{trip.matchReason}</dd>
            </div>
            <div><dt>Pace</dt><dd>{trip.pace} · {demo ? "Example preference; confirm together before meeting." : "Confirm the day’s rhythm together."}</dd></div>
          </dl>
          <button type="button" className="primary-button" onClick={() => setDialog(connectContent(demo))}>
            Connect ↗
          </button>
          <p className="small-copy">Sign up to send an invite. Chat opens when you both accept.</p>
          <p className="safety-note">Exact age and preferences stay private.</p>
          <InfoButton content={SAFETY_TIPS}>Meet in public places first · Safety tips ↗</InfoButton>
        </aside>
      </div>
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}
