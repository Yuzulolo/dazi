import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/profile/queries";
import { ProfileForm } from "@/app/_components/profile-form";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { saveBasics, saveStyle } from "./actions";

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel">
        <h1>Set up your travel profile</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <Onboarding searchParams={searchParams} />
        </Suspense>
      </section>
    </SiteShell>
  );
}

async function Onboarding({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const user = await getCurrentUser({ allowIncompleteOnboarding: true });
  if (user.onboarded) redirect("/me/edit");

  const profile = await getMyProfile();
  const { step } = await searchParams;
  const showStep = !profile.basicsSaved || step === "1" ? 1 : 2;

  if (showStep === 1) {
    return (
      <>
        <StepProgress step={1} />
        <h2>About you</h2>
        <p className="notice">
          Your bio, hobbies, cities and travel interests are turned into an AI “embedding” (a list of numbers) for
          matching. <Link href="/privacy">How we use AI</Link>
        </p>
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
      <StepProgress step={2} />
      <h2>Your travel style</h2>
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

function StepProgress({ step }: { step: 1 | 2 }) {
  return (
    <>
      <p className="eyebrow">Step {step} of 2</p>
      <div className="step-progress" aria-hidden="true">
        <span className="done" />
        <span className={step === 2 ? "done" : undefined} />
      </div>
    </>
  );
}
