import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile/queries";
import { ProfileForm } from "@/app/_components/profile-form";
import { saveBasics, saveStyle } from "./actions";

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <main>
      <h1>Set up your travel profile</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Onboarding searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const user = await getCurrentUser({ allowIncompleteOnboarding: true });
  if (user.onboarded) redirect("/me/edit");

  const profile = await getMyProfile(user.id);
  const { step } = await searchParams;
  const showStep = !profile.basicsSaved || step === "1" ? 1 : 2;

  if (showStep === 1) {
    return (
      <>
        <h2>Step 1 of 2: About you</h2>
        <ProfileForm
          key="basics"
          action={saveBasics}
          initial={profile.values}
          sections={{ basics: { birthYear: profile.birthYear } }}
          submitLabel="Next"
        />
      </>
    );
  }

  return (
    <>
      <h2>Step 2 of 2: Your travel style</h2>
      <p>
        <Link href="/onboarding?step=1">← Back to step 1</Link>
      </p>
      <ProfileForm
        key="style"
        action={saveStyle}
        initial={profile.values}
        sections={{ style: true }}
        submitLabel="Finish"
      />
    </>
  );
}
