import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPublicProfile } from "@/lib/profile/queries";
import { DAY_RHYTHMS, TRAVEL_INTERESTS, TRAVEL_PACES, labelOf } from "@/lib/profile/options";
import { languageLabel } from "@/lib/profile/languages";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { AbstractAvatar, Tags } from "@/app/_components/dazi/primitives";
import { InfoButton } from "@/app/_components/dazi/info-dialog";
import { HOW_IT_WORKS } from "@/app/_components/dazi/copy";
import { SignOutButton } from "@/app/_components/dazi/auth-buttons";

export default function PublicProfilePage({ params }: PageProps<"/u/[id]">) {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel">
        <Suspense fallback={<p>Loading…</p>}>
          <PublicProfile params={params} />
        </Suspense>
        <p className="panel-footer">
          <Link href="/plan">← My plan</Link>
        </p>
      </section>
    </SiteShell>
  );
}

// Signed-in users only. Reads the public_profiles view: age range, never the
// birth year; no gender, no matching preferences.
async function PublicProfile({ params }: { params: PageProps<"/u/[id]">["params"] }) {
  const viewer = await getCurrentUser();
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) return <h1>User not found</h1>;
  const own = profile.id === viewer.id;

  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : "—");
  const languages = profile.languages.map(languageLabel);
  const interests = profile.travelInterests.map((v) => labelOf(TRAVEL_INTERESTS, v));

  return (
    <>
      <div className="profile-head">
        <AbstractAvatar size="large" />
        <div>
          <h1>{profile.displayName}</h1>
          <p>
            Age {profile.ageRange ?? "—"} · {profile.homeCity ?? "—"}
          </p>
        </div>
      </div>
      {own && (
        <>
          <p>This is how other members see you.</p>
          {/* Account links live here since phase 7a (the header has only My plan · Matches · Profile). */}
          <div className="panel-links">
            <Link className="outline-button" href="/me/edit">
              Edit profile
            </Link>
            <Link className="text-button" href="/settings">
              Settings
            </Link>
            <InfoButton content={HOW_IT_WORKS}>How it works</InfoButton>
            <SignOutButton />
          </div>
        </>
      )}

      <dl className="profile-facts">
        <div>
          <dt>LANGUAGES</dt>
          <dd>{languages.length > 0 ? <Tags values={languages} label="Languages" /> : "—"}</dd>
        </div>
        <div>
          <dt>ABOUT</dt>
          <dd>{profile.bio ?? "—"}</dd>
        </div>
        <div>
          <dt>{own ? "CITIES YOU LOVE TO TRAVEL TO" : "CITIES THEY LOVE TO TRAVEL TO"}</dt>
          <dd>{list(profile.visitedCities)}</dd>
        </div>
        <div>
          <dt>HOBBIES</dt>
          <dd>{list(profile.hobbies)}</dd>
        </div>
      </dl>

      <h2>Travel style</h2>
      <dl className="profile-facts">
        <div>
          <dt>PACE</dt>
          <dd>{profile.travelPace === null ? "—" : labelOf(TRAVEL_PACES, String(profile.travelPace))}</dd>
        </div>
        <div>
          <dt>DAY RHYTHM</dt>
          <dd>{labelOf(DAY_RHYTHMS, profile.dayRhythm) || "—"}</dd>
        </div>
        <div>
          <dt>INTERESTS</dt>
          <dd>{interests.length > 0 ? <Tags values={interests} label="Travel interests" /> : "—"}</dd>
        </div>
      </dl>
    </>
  );
}
