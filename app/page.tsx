import Link from "next/link";

export default function LandingPage() {
  return (
    <main>
      <h1>Dazi</h1>
      <p>Find a travel or food buddy. Coming soon.</p>
      <p>
        <Link href="/login">Log in</Link> · <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
