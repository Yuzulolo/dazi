import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile/queries";
import { ProfileForm } from "@/app/_components/profile-form";
import { updateProfile } from "./actions";

export default function EditProfilePage() {
  return (
    <main>
      <h1>Edit your profile</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <EditProfile />
      </Suspense>
    </main>
  );
}

async function EditProfile() {
  const user = await getCurrentUser();
  const profile = await getMyProfile(user.id);

  return (
    <>
      <p>
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
