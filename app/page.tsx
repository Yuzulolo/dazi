import { Suspense } from "react";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { HomeWall } from "@/app/_components/dazi/walls";
import { ClearStoredPlan } from "@/app/home/clear-stored-plan";
import { DEMO_MATCHES, demoTrips } from "@/lib/demo/trips";

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
      <HomeWall trips={DEMO_MATCHES ? demoTrips.slice(0, 2) : []} demo={DEMO_MATCHES} />
    </SiteShell>
  );
}

async function Notice({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { deleted, demo } = await searchParams;
  const key = deleted === "1" ? "deleted" : typeof demo === "string" ? demo : null;
  const message = key ? NOTICES[key] : undefined;
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
