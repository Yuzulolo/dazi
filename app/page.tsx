import { Suspense } from "react";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { HomeWall } from "@/app/_components/dazi/walls";
import type { HomeViewer } from "@/app/_components/dazi/types";
import { ClearStoredPlan } from "@/app/plan/clear-stored-plan";
import { DEMO_MATCHES, demoTrips } from "@/lib/demo/trips";
import { getViewer } from "@/lib/auth";
import { speechEnabled } from "@/lib/speech/flag";

const NOTICES: Record<string, string> = {
  deleted: "Your account and data have been deleted.",
  busy: "The demo account is busy, please try again in a minute.",
  unavailable: "The demo account isn't available right now.",
};

// Poster-wall homepage: the plan composer plus two clearly labelled example posters.
// The composer keeps the sentence for after sign-up (FLOWS 1.1); full guest search is Roadmap.
export default function LandingPage({ searchParams }: PageProps<"/">) {
  return (
    <SiteShell variant="wall" demo={DEMO_MATCHES}>
      <Suspense>
        <Notice searchParams={searchParams} />
      </Suspense>
      {/* The wall first renders as for a guest; the server then tells the composer who is
          looking (signed-in members go straight to /posts/new). */}
      <Suspense fallback={<Wall viewer={{ status: "guest" }} />}>
        <WallForViewer />
      </Suspense>
    </SiteShell>
  );
}

function Wall({ viewer, speech = false }: { viewer: HomeViewer; speech?: boolean }) {
  return <HomeWall trips={DEMO_MATCHES ? demoTrips.slice(0, 2) : []} demo={DEMO_MATCHES} viewer={viewer} speech={speech} />;
}

async function WallForViewer() {
  const v = await getViewer();
  // Speech input (phase 8) is for signed-in users only; guests never get the mic.
  if (v.status === "guest") return <Wall viewer={v} />;
  return <Wall viewer={{ status: v.status, userId: v.userId }} speech={speechEnabled()} />;
}

async function Notice({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { deleted, demo } = await searchParams;
  const key = deleted === "1" ? "deleted" : typeof demo === "string" ? demo : null;
  // Own properties only: "?demo=__proto__" must not reach Object.prototype (review W4).
  const message = key && Object.hasOwn(NOTICES, key) ? NOTICES[key] : undefined;
  if (!message) return null;
  return (
    <>
      {key === "deleted" && <ClearStoredPlan />}
      <p className="glass home-notice" role="status">
        {message}
      </p>
    </>
  );
}
