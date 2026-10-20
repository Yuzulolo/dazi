import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyActivePost } from "@/lib/posts/queries";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { PostPoster } from "@/app/_components/dazi/post-poster";
import { ContinuePlan } from "./continue-plan";
import { InvitesSection } from "./invites";
import { messagingEnabled } from "@/lib/messaging/flag";

export const metadata: Metadata = { title: "My plan · Dazi" };

// The signed-in hub: your active plan and how to change it. Matches live on /matches.
export default function MyPlanPage() {
  return (
    <SiteShell variant="calm">
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <MyPlan />
      </Suspense>
    </SiteShell>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function MyPlan() {
  const user = await getCurrentUser();
  const post = await getMyActivePost(user.id);

  return (
    <div className="home-layout">
      <section className="glass calm-panel">
        <h1>Hello, {user.displayName}</h1>
        <p className="calm-lead">
          {!post
            ? "Tell us your next plan and find your people."
            : post.ended
              ? "This plan has ended — post a new one."
              : "Your active plan."}
        </p>
        {user.isDemoLogin && (
          <p className="notice shared-demo" role="note">
            <strong>Shared demo account.</strong> Other visitors use it too — anything you enter here is visible to them,
            and AI limits are shared. It is reset before demos.
          </p>
        )}
        {!user.isDemoLogin && <ContinuePlan user={{ id: user.id, accountCreatedAt: user.accountCreatedAt }} />}
        <div className="panel-links">
          {post && !post.ended ? (
            <>
              <Link className="primary-button" href="/matches">
                See your matches →
              </Link>
              <Link className="outline-button" href="/posts/edit">
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
      </section>
      {post && (
        <PostPoster {...post} ai={post.aiAssisted ? "assisted" : null} eyebrow={post.ended ? "Ended plan" : "My plan"} />
      )}
      {messagingEnabled() && (
        <Suspense fallback={<p className="calm-lead">Loading invites…</p>}>
          <InvitesSection />
        </Suspense>
      )}
    </div>
  );
}
