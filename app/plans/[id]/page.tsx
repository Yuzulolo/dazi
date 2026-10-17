import { Suspense } from "react";
import Link from "next/link";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { PlanDetail } from "@/app/_components/dazi/walls";
import { DEMO_MATCHES, findDemoTrip } from "@/lib/demo/trips";

// Recruitment detail for guests. Demo trips only until part E.
export default function PlanPage({ params }: PageProps<"/plans/[id]">) {
  return (
    <SiteShell variant="wall" demo={DEMO_MATCHES}>
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <Plan params={params} />
      </Suspense>
    </SiteShell>
  );
}

async function Plan({ params }: { params: PageProps<"/plans/[id]">["params"] }) {
  const { id } = await params;
  const trip = DEMO_MATCHES ? findDemoTrip(id) : null;

  if (!trip) {
    return (
      <div className="empty-state glass">
        <h1>That plan isn’t available.</h1>
        <Link className="primary-button" href="/matches">
          Back to matches
        </Link>
      </div>
    );
  }
  return <PlanDetail trip={trip} demo={DEMO_MATCHES} />;
}
