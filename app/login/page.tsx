import { Suspense } from "react";
import Link from "next/link";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { LoginForm } from "./login-form";
import { DemoButton } from "@/app/_components/dazi/auth-buttons";

// Messages for problems reported by /auth/callback and /auth/signout.
const CALLBACK_ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please log in, or sign up again.",
  account_problem: "We couldn't load your account, so you were signed out. Please log in again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel" data-width="narrow">
        <h1>Log in</h1>
        <p className="calm-lead">Welcome back. Your plans are waiting.</p>
        <Suspense>
          <CallbackError searchParams={searchParams} />
        </Suspense>
        <LoginForm />
        <p className="panel-footer">
          New to Dazi? <Link href="/signup">Sign up</Link>
        </p>
        <div className="panel-links">
          <DemoButton />
        </div>
      </section>
    </SiteShell>
  );
}

async function CallbackError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error } = await searchParams;
  const message = typeof error === "string" && Object.hasOwn(CALLBACK_ERRORS, error) ? CALLBACK_ERRORS[error] : undefined;
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
