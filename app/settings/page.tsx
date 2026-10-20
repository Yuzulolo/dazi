import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { DeleteAccountForm } from "./delete-form";

export const metadata = { title: "Settings · Dazi" };

export default function SettingsPage() {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel" data-width="narrow">
        <h1>Settings</h1>
        <Suspense fallback={<p>Loading…</p>}>
          <Settings />
        </Suspense>
      </section>
    </SiteShell>
  );
}

async function Settings() {
  // Reachable before onboarding is finished: deleting must not require giving more data (review W1).
  const user = await getCurrentUser({ allowIncompleteOnboarding: true });
  return (
    <>
      <h2>Delete my account</h2>
      <p>
        This permanently deletes your account and everything linked to it: your profile, your plans,
        match explanations and AI usage records. Read more in our <Link href="/privacy">Privacy</Link> page.
      </p>
      <DeleteAccountForm />
      <p className="panel-footer">
        <Link href={user.onboarded ? `/u/${user.id}` : "/onboarding"}>← {user.onboarded ? "My profile" : "Back to onboarding"}</Link>
      </p>
    </>
  );
}
