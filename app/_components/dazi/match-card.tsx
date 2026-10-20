import type { ReactNode } from "react";
import { TRAVEL_INTERESTS, labelOf } from "@/lib/profile/options";
import { languageLabel } from "@/lib/profile/languages";
import { formatDateRange } from "@/lib/posts/format";
import type { Match, MatchReason } from "@/lib/matching/types";
import { todayInBerlin, type Tone } from "@/lib/posts/card";
import { upcomingOverlap } from "@/lib/matching/overlap";
import { AIBadge, DemoBadge, Headline, Identity, Paper, Tags } from "./primitives";

// One match on /matches "For you": the other person's plan as a poster, the reason
// (AI-generated or rule-based) and the three parts of the score. `actions` = the invite
// controls (phase 7b), only passed when messaging is enabled.
export function MatchCard({ match, reason, actions }: { match: Match; reason: MatchReason; actions?: ReactNode }) {
  const parts: [string, number][] = [
    ["Trip", match.tripScore],
    ["Style", match.styleScore],
    ["Personality", match.personalityScore],
  ];
  return (
    <Paper tone={match.tone as Tone} className="match-card">
      <p className="eyebrow">Similar plan</p>
      {match.isDemo && <DemoBadge />}
      <Headline lines={match.headline} />
      <p className="trip-date">
        {match.city} / {formatDateRange(...upcomingOverlap(match.overlapStart, match.overlapEnd, todayInBerlin().iso))}
      </p>
      <Tags values={match.interests.map((v) => labelOf(TRAVEL_INTERESTS, v))} label="Interests" />
      <Identity
        trip={{
          name: match.displayName,
          ageRange: match.ageRange ?? "—",
          languages: match.languages.map(languageLabel),
        }}
      />
      <div className="glass match-reason">
        <p className="eyebrow">
          Why you might get along {reason.ai ? <AIBadge /> : <span className="rule-badge">Suggested match</span>}
        </p>
        <p>{reason.text}</p>
        <dl className="score-parts" aria-label="Why you match">
          {parts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <span className="score-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(value * 100)}%` }} />
                </span>
                {Math.round(value * 100)}%
              </dd>
            </div>
          ))}
        </dl>
        {actions}
      </div>
    </Paper>
  );
}
