import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";

// Messages for problems reported by /auth/callback (e.g. an expired email link).
const CALLBACK_ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please log in, or sign up again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main>
      <h1>Log in</h1>
      <Suspense>
        <CallbackError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
      {/* Google sign-in button goes here (later in phase 1). */}
      <p>
        New to Dazi? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}

async function CallbackError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? CALLBACK_ERRORS[error] : undefined;
  if (!message) return null;
  return <p role="alert">{message}</p>;
}
