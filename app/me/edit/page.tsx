import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile/queries";
import { ProfileForm } from "@/app/_components/profile-form";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { updateProfile } from "./actions";

export default function EditProfilePage() {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel">
        <h1>Edit your profile</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <EditProfile />
        </Suspense>
      </section>
    </SiteShell>
  );
}

async function EditProfile() {
  const user = await getCurrentUser();
  const profile = await getMyProfile();

  return (
    <>
      <p className="calm-lead">
        <Link href={`/u/${user.id}`}>View my public profile</Link> · <Link href="/home">Home</Link>
      </p>
      <ProfileForm
        action={updateProfile}
        initial={profile.values}
        sections={{ basics: { birthYear: profile.birthYear }, style: true }}
        submitLabel="Save changes"
      />
    </>
  );
}
