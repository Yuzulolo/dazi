import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";

export default function HomePage() {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <Greeting />
      </Suspense>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}

// Reads the session, so it streams in behind the Suspense boundary.
async function Greeting() {
  const user = await getCurrentUser();
  return (
    <>
      <h1>Hello, {user.displayName}</h1>
      <p>
        <Link href={`/u/${user.id}`}>My profile</Link> · <Link href="/me/edit">Edit profile</Link>
      </p>
    </>
  );
}
