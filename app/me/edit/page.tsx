import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile/queries";
import { ProfileForm } from "@/app/_components/profile-form";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { updateProfile } from "./actions";

export default function EditProfilePage({ searchParams }: PageProps<"/me/edit">) {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel">
        <h1>Edit your profile</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <EditProfile searchParams={searchParams} />
        </Suspense>
      </section>
    </SiteShell>
  );
}

async function EditProfile({ searchParams }: { searchParams: PageProps<"/me/edit">["searchParams"] }) {
  const user = await getCurrentUser();
  const [profile, { saved }] = await Promise.all([getMyProfile(), searchParams]);

  return (
    <>
      <p className="calm-lead">
        <Link href={`/u/${user.id}`}>View my public profile</Link> · <Link href="/home">Home</Link>
      </p>
      {saved === "1" && (
        <p className="form-success" aria-live="polite">
          Saved.
        </p>
      )}
      {/* key = the stored values: when the page comes back with changed data, the kept-alive
          form (Next 16 Activity) is rebuilt with fresh values instead of showing old ones. */}
      <ProfileForm
        key={JSON.stringify(profile.values)}
        action={updateProfile}
        initial={profile.values}
        sections={{ basics: { birthYear: profile.birthYear }, style: true }}
        submitLabel="Save changes"
      />
    </>
  );
}
