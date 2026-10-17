import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import { SiteShell } from "@/app/_components/dazi/site-shell";

export default function HomePage() {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel">
        <Suspense fallback={<p>Loading…</p>}>
          <Greeting />
        </Suspense>
        <form action={signOut} className="panel-footer">
          <button type="submit" className="text-button">
            Sign out
          </button>
        </form>
      </section>
    </SiteShell>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function Greeting() {
  const user = await getCurrentUser();
  return (
    <>
      <h1>Hello, {user.displayName}</h1>
      <p className="calm-lead">Your plans and matches will appear here.</p>
      <div className="panel-links">
        <Link className="primary-button" href={`/u/${user.id}`}>
          My profile
        </Link>
        <Link className="outline-button" href="/me/edit">
          Edit profile
        </Link>
      </div>
    </>
  );
}
