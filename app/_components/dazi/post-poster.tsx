import { TRAVEL_INTERESTS, labelOf } from "@/lib/profile/options";
import { BUDGET_LABELS, type Budget, type Tone } from "@/lib/posts/card";
import { formatDateRange } from "@/lib/posts/format";
import { AIBadge, Headline, Paper, Tags } from "./primitives";

// A post shown as a poster: /plan (my active post) and the live preview in the
// post editor. No hooks, so it renders on the server and inside client components.
export function PostPoster({
  headline,
  city,
  startDate,
  endDate,
  interests,
  budget,
  vibe,
  tone,
  ai,
  eyebrow = "My plan",
}: {
  headline: [string, string];
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  interests: string[];
  budget: Budget | null;
  vibe: string | null;
  tone: Tone;
  ai: "draft" | "assisted" | null; // draft = AI-generated, not saved yet; assisted = saved post made from an AI draft
  eyebrow?: string;
}) {
  const lines: [string, string] = [headline[0] || "Your headline.", headline[1] || "Second line."];
  return (
    <Paper tone={tone} className="post-poster">
      <p className="eyebrow">{eyebrow}</p>
      {ai === "draft" && <AIBadge />}
      <Headline lines={lines} />
      <p className="trip-date">
        {city || "City"} / {formatDateRange(startDate, endDate)}
      </p>
      {interests.length > 0 && <Tags values={interests.map((v) => labelOf(TRAVEL_INTERESTS, v))} label="Interests" />}
      {(vibe || budget) && <p className="post-vibe">{[vibe, budget ? BUDGET_LABELS[budget] : null].filter(Boolean).join(" · ")}</p>}
      {ai === "assisted" && <p className="post-ai-note">Drafted with AI, checked by the author.</p>}
    </Paper>
  );
}
