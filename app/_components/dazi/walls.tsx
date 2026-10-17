"use client";

import { useState } from "react";
import Link from "next/link";
import { InfoDialog, InfoButton } from "./info-dialog";
import { PlanComposerContent } from "./plan-composer";
import { PosterCarousel, type CarouselItem } from "./poster-carousel";
import { TripPosterContent } from "./trip-poster";
import { AIBadge, DemoBadge, Headline, Identity, Paper, Tags } from "./primitives";
import { PLAN_KEY, POSITION_KEY, useSessionValue } from "./use-session-value";
import { CONNECT_DEMO, SAFETY_TIPS } from "./copy";
import type { DialogContent, GuestTrip } from "./types";

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
export function HomeWall({ trips, demo }: { trips: GuestTrip[]; demo: boolean }) {
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const items: CarouselItem[] = [
    {
      key: "composer",
      tone: "mint",
      label: "Your next plan",
      className: "composer",
      content: (current) => <PlanComposerContent current={current} />,
    },
    ...tripItems(trips, demo, () => setDialog(connectContent(demo))),
  ];

  return (
    <>
      <p className="wall-caption">
        A WALL OF LITTLE PLANS {demo && <span>DESIGN DEMO · FICTIONAL TRIPS</span>}
      </p>
      <PosterCarousel items={items} />
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// Guest results: the plan summary, then the matching posters.
export function MatchesWall({ trips, demo }: { trips: GuestTrip[]; demo: boolean }) {
  const [plan] = useSessionValue(PLAN_KEY);
  const [dialog, setDialog] = useState<DialogContent | null>(null);
  const count = trips.length;
  const countWord = COUNT_WORDS[count] ?? String(count);

  return (
    <>
      <div className="results-intro">
        <div className="glass plan-summary">
          <div>
            <span className="eyebrow">Your plan</span>
            {demo && <DemoBadge>Demo matches</DemoBadge>}
            <p>{plan?.trim() || "Example plan: Berlin · 20–25 Oct · Food & markets · Slow pace"}</p>
          </div>
          <Link className="outline-button" href="/">
            Edit plan
          </Link>
        </div>
        <h1>{count ? `${countWord} ${count === 1 ? "plan" : "plans"}. A little common ground.` : "No buddies yet for these dates."}</h1>
        {demo && <p className="demo-copy">Fictional examples — live matching is not connected yet.</p>}
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
      {dialog && <InfoDialog content={dialog} onClose={() => setDialog(null)} />}
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
          <AIBadge />
          <dl className="match-facts">
            <div>
              <dt>Dates</dt>
              <dd>{trip.overlap}</dd>
            </div>
            <div>
              <dt>Interests</dt>
              <dd>{trip.matchReason}</dd>
            </div>
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
