import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPublicProfile } from "@/lib/profile/queries";
import { DAY_RHYTHMS, LANGUAGES, TRAVEL_INTERESTS, TRAVEL_PACES, labelOf } from "@/lib/profile/options";

export default function PublicProfilePage({ params }: PageProps<"/u/[id]">) {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <PublicProfile params={params} />
      </Suspense>
      <p>
        <Link href="/home">← Home</Link>
      </p>
    </main>
  );
}

// Signed-in users only. Reads the public_profiles view: age range, never the
// birth year; no gender, no matching preferences.
async function PublicProfile({ params }: { params: PageProps<"/u/[id]">["params"] }) {
  const viewer = await getCurrentUser();
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) return <h1>User not found</h1>;

  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : "—");

  return (
    <>
      <h1>{profile.displayName}</h1>
      {profile.id === viewer.id && (
        <p>
          This is how other members see you. <Link href="/me/edit">Edit profile</Link>
        </p>
      )}
      <dl>
        <dt>Age</dt>
        <dd>{profile.ageRange ?? "—"}</dd>
        <dt>Home city</dt>
        <dd>{profile.homeCity ?? "—"}</dd>
        <dt>Languages</dt>
        <dd>{list(profile.languages.map((v) => labelOf(LANGUAGES, v)))}</dd>
        <dt>About</dt>
        <dd>{profile.bio ?? "—"}</dd>
        <dt>Cities visited</dt>
        <dd>{list(profile.visitedCities)}</dd>
        <dt>Hobbies</dt>
        <dd>{list(profile.hobbies)}</dd>
      </dl>

      <h2>Travel style</h2>
      <dl>
        <dt>Pace</dt>
        <dd>{profile.travelPace === null ? "—" : labelOf(TRAVEL_PACES, String(profile.travelPace))}</dd>
        <dt>Day rhythm</dt>
        <dd>{labelOf(DAY_RHYTHMS, profile.dayRhythm) || "—"}</dd>
        <dt>Interests</dt>
        <dd>{list(profile.travelInterests.map((v) => labelOf(TRAVEL_INTERESTS, v)))}</dd>
      </dl>
    </>
  );
}
