import { SiteShell } from "@/app/_components/dazi/site-shell";
import { HomeWall } from "@/app/_components/dazi/walls";
import { DEMO_MATCHES, demoTrips } from "@/lib/demo/trips";

// Poster-wall homepage. The plan composer leads to /matches; until guest
// search exists (part E) the wall and the matches are fictional demo trips.
export default function HomePage() {
  return (
    <SiteShell variant="wall" demo={DEMO_MATCHES}>
      <HomeWall trips={DEMO_MATCHES ? demoTrips : []} demo={DEMO_MATCHES} />
    </SiteShell>
  );
}
