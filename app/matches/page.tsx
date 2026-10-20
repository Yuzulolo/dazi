import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser, getViewer } from "@/lib/auth";
import { getMyActivePost } from "@/lib/posts/queries";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { MatchesWall } from "@/app/_components/dazi/walls";
import { MatchCard } from "@/app/_components/dazi/match-card";
import { ClearStoredPlan } from "@/app/plan/clear-stored-plan";
import { getMyMatches, getMatchSuggestion } from "@/lib/matching/queries";
import { getMatchReasons } from "@/lib/ai/match-reasons";
import { DEMO_MATCHES, demoTrips } from "@/lib/demo/trips";
import type { MyPost } from "@/lib/posts/queries";
import { messagingEnabled } from "@/lib/messaging/flag";
import { getMyInvites, type Invite } from "@/lib/messaging/queries";
import { MatchInviteControls } from "@/app/_components/dazi/invite-controls";

export const metadata: Metadata = { title: "Matches · Dazi" };

// Guests (and not-yet-onboarded users) see the demo wall; members see "For you" —
// their real matches. A neutral fallback, so members never flash the demo wall (review S1).
export default function MatchesPage({ searchParams }: PageProps<"/matches">) {
  return (
    <Suspense
      fallback={
        <SiteShell variant="calm">
          <p className="wall-caption">Loading…</p>
        </SiteShell>
      }
    >
      <MatchesForViewer searchParams={searchParams} />
    </Suspense>
  );
}

function GuestMatches() {
  return (
    <SiteShell variant="wall" demo={DEMO_MATCHES}>
      <MatchesWall trips={DEMO_MATCHES ? demoTrips : []} demo={DEMO_MATCHES} />
    </SiteShell>
  );
}

async function MatchesForViewer({ searchParams }: { searchParams: PageProps<"/matches">["searchParams"] }) {
  const viewer = await getViewer();
  if (viewer.status !== "member") return <GuestMatches />;

  const [user, { posted }] = await Promise.all([getCurrentUser(), searchParams]);
  const post = await getMyActivePost(user.id);
  const active = post && !post.ended ? post : null;

  return (
    <SiteShell variant="calm">
      <section className="for-you matches-page" aria-labelledby="for-you-title">
        {posted === "1" && <ClearStoredPlan />}
        <h1 id="for-you-title">For you</h1>
        {posted === "1" && (
          <p className="form-success" aria-live="polite">
            Your plan is saved.
          </p>
        )}
        {active ? (
          <>
            <p className="notice">
              Ranked by AI similarity of plans and profiles plus your travel style. Reasons marked “AI-generated”
              are written by AI. <Link href="/privacy">How we use AI</Link>
            </p>
            {/* Own boundary: the page never waits for the AI reasons. */}
            <Suspense fallback={<p className="calm-lead">Finding your matches…</p>}>
              <ForYou post={active} demoLogin={user.isDemoLogin} />
            </Suspense>
          </>
        ) : (
          <div className="glass empty-state">
            <h2>{post ? "Your plan has ended." : "No plan yet."}</h2>
            <p>Post a plan and we&apos;ll suggest buddies with the same dates and city.</p>
            <Link className="primary-button" href="/posts/new">
              Post your plan ↗
            </Link>
          </div>
        )}
      </section>
    </SiteShell>
  );
}

// Top 5 from public.match_my_post() (hard filters + scoring in the database) with
// cached / batched AI reasons. No matches → a date-widening suggestion computed in SQL.
async function ForYou({ post, demoLogin }: { post: MyPost; demoLogin: boolean }) {
  const matches = await getMyMatches(5);
  if (matches === null) {
    return <p className="calm-lead">Matches are unavailable right now. Please try again in a moment.</p>;
  }
  if (matches.length === 0) {
    const suggestion = await getMatchSuggestion();
    return (
      <div className="glass empty-state">
        <h2>No buddies yet for these dates.</h2>
        <p>
          {suggestion
            ? `Try ±${suggestion.extraDays} days → ${suggestion.matches} ${suggestion.matches === 1 ? "person" : "people"}.`
            : "New plans arrive every day — check back soon."}
        </p>
        <Link className="outline-button" href="/posts/edit">
          Change my dates
        </Link>
      </div>
    );
  }
  const messaging = messagingEnabled();
  const [reasons, invites] = await Promise.all([
    getMatchReasons(post, matches),
    messaging ? getMyInvites() : Promise.resolve(null),
  ]);
  return (
    <div className="match-grid">
      {matches.map((m) => (
        <MatchCard
          key={m.postId}
          match={m}
          reason={reasons.get(m.postId)!}
          actions={
            messaging && (
              <MatchInviteControls
                postId={m.postId}
                displayName={m.displayName}
                isDemo={m.isDemo}
                invite={inviteFor(invites, m.postId)}
                demoLogin={demoLogin}
              />
            )
          }
        />
      ))}
    </div>
  );
}

// The newest open or accepted invite (either direction) with this plan. A decline / cancel /
// expiry shows the Invite button again: the database decides whether a new invite is allowed
// (e.g. not again after a decline for the same pair of plans) and says why (review S1).
function inviteFor(invites: Invite[] | null, postId: string) {
  const hit = invites?.find((i) => i.postId === postId && ["pending", "accepted", "closed"].includes(i.status));
  return hit ? { id: hit.id, direction: hit.direction, status: hit.status } : null;
}
