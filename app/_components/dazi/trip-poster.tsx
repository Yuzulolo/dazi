"use client";

import Link from "next/link";
import { AIBadge, DemoBadge, Headline, Identity, Tags } from "./primitives";
import type { GuestTrip } from "./types";

// Content of one recruitment poster in the carousel (the Paper comes from the carousel).
export function TripPosterContent({
  trip,
  current,
  demo,
  onConnect,
}: {
  trip: GuestTrip;
  current: boolean;
  demo: boolean;
  onConnect: () => void;
}) {
  const tab = current ? 0 : -1;
  return (
    <>
      <p className="eyebrow">Similar plans</p>
      {demo && <DemoBadge />}
      <Headline lines={trip.headline} />
      <p className="trip-date">
        {trip.city} / {trip.dates}
      </p>
      <Tags values={trip.interests} label="Interests" />
      <Identity trip={trip} />
      <div className="glass match-reason">
        <p className="eyebrow">
          Why you might get along {demo ? <span className="rule-badge">Example AI reason</span> : <AIBadge />}
        </p>
        <p>{trip.matchReason}</p>
        <div className="poster-actions">
          <Link className="primary-button" tabIndex={tab} href={`/plans/${encodeURIComponent(trip.id)}`}>
            View plan ↗
          </Link>
          <button type="button" className="outline-button" disabled={!current} tabIndex={tab} onClick={onConnect}>
            Connect
          </button>
        </div>
      </div>
    </>
  );
}
