import type { Metadata } from "next";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { MatchesWall } from "@/app/_components/dazi/walls";
import { DEMO_MATCHES, demoTrips } from "@/lib/demo/trips";

export const metadata: Metadata = { title: "Matches · Dazi" };

// Guest results. Real, server-redacted matches replace the demo trips in part E.
export default function MatchesPage() {
  return (
    <SiteShell variant="wall" demo={DEMO_MATCHES}>
      <MatchesWall trips={DEMO_MATCHES ? demoTrips : []} demo={DEMO_MATCHES} />
    </SiteShell>
  );
}
