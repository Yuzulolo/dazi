import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";

// Messages for problems reported by /auth/callback and /auth/signout.
const CALLBACK_ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please log in, or sign up again.",
  account_problem: "We couldn't load your account, so you were signed out. Please log in again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main>
      <h1>Log in</h1>
      <Suspense>
        <CallbackError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
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
