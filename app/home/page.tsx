import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyActivePost } from "@/lib/posts/queries";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { PostPoster } from "@/app/_components/dazi/post-poster";
import { ClearStoredPlan } from "./clear-stored-plan";
import { ContinuePlan } from "./continue-plan";
import { SignOutButton } from "@/app/_components/dazi/auth-buttons";
import { MatchCard } from "@/app/_components/dazi/match-card";
import { getMyMatches, getMatchSuggestion } from "@/lib/matching/queries";
import { getMatchReasons } from "@/lib/ai/match-reasons";
import type { MyPost } from "@/lib/posts/queries";

export default function HomePage({ searchParams }: PageProps<"/home">) {
  return (
    <SiteShell variant="calm">
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <Home searchParams={searchParams} />
      </Suspense>
    </SiteShell>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function Home({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
  const user = await getCurrentUser();
  const [post, { posted }] = await Promise.all([getMyActivePost(user.id), searchParams]);

  return (
    <div className="home-layout">
      {posted === "1" && <ClearStoredPlan />}
      <section className="glass calm-panel">
        <h1>Hello, {user.displayName}</h1>
        {posted === "1" && (
          <p className="form-success" aria-live="polite">
            Your plan is saved.
          </p>
        )}
        <p className="calm-lead">
          {!post
            ? "Tell us your next plan and find your people."
            : post.ended
              ? "This plan has ended — post a new one."
              : "Your active plan — your matches are below."}
        </p>
        {posted !== "1" && <ContinuePlan />}
        <div className="panel-links">
          {post && !post.ended ? (
            <>
              <Link className="primary-button" href="/posts/edit">
                Edit plan
              </Link>
              <Link className="outline-button" href="/posts/new">
                New plan
              </Link>
            </>
          ) : (
            <Link className="primary-button" href="/posts/new">
              Post your plan ↗
            </Link>
          )}
        </div>
        <div className="panel-links">
          <Link className="text-button" href={`/u/${user.id}`}>
            My profile
          </Link>
          <Link className="text-button" href="/me/edit">
            Edit profile
          </Link>
        </div>
        <div className="panel-footer panel-links">
          <Link className="text-button" href="/settings">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </section>
      {post && (
        <PostPoster {...post} ai={post.aiAssisted ? "assisted" : null} eyebrow={post.ended ? "Ended plan" : "My plan"} />
      )}
      {post && !post.ended && (
        <section className="for-you" aria-labelledby="for-you-title">
          <h2 id="for-you-title">For you</h2>
          <p className="notice">
            Ranked by AI similarity of plans and profiles plus your travel style. Reasons marked “AI-generated”
            are written by AI. <Link href="/privacy">How we use AI</Link>
          </p>
          {/* Own boundary: the page never waits for the AI reasons. */}
          <Suspense fallback={<p className="calm-lead">Finding your matches…</p>}>
            <ForYou post={post} />
          </Suspense>
        </section>
      )}
    </div>
  );
}

// Top 5 from public.match_my_post() (hard filters + scoring in the database) with
// cached / batched AI reasons. No matches → a date-widening suggestion computed in SQL.
async function ForYou({ post }: { post: MyPost }) {
  const matches = await getMyMatches(5);
  if (matches === null) {
    return <p className="calm-lead">Matches are unavailable right now. Please try again in a moment.</p>;
  }
  if (matches.length === 0) {
    const suggestion = await getMatchSuggestion();
    return (
      <div className="glass empty-state">
        <h3>No buddies yet for these dates.</h3>
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
  const reasons = await getMatchReasons(post, matches);
  return (
    <div className="match-grid">
      {matches.map((m) => (
        <MatchCard key={m.postId} match={m} reason={reasons.get(m.postId)!} />
      ))}
    </div>
  );
}
