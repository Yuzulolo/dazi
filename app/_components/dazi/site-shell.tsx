import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { InfoButton } from "./info-dialog";
import { HOW_IT_WORKS } from "./copy";

// Page frame for every screen (docs/DESIGN.md → Page variants):
// "wall" = poster carousel pages, "calm" = forms and profile pages.
export function SiteShell({
  variant,
  demo = false,
  mainClassName,
  children,
}: {
  variant: "wall" | "calm";
  demo?: boolean; // page shows fictional demo data → footer says so
  mainClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="dazi-root" data-variant={variant}>
      <div className="wall-background" aria-hidden="true" />
      <header className="dazi-header">
        <Suspense fallback={<Wordmark href="/" />}>
          <AuthWordmark />
        </Suspense>
        <span className="header-note">LITTLE PLANS, GOOD COMPANY.</span>
        <nav aria-label="Main navigation">
          <InfoButton content={HOW_IT_WORKS}>How it works</InfoButton>
          <Suspense fallback={<SignedOutLinks />}>
            <AuthLinks />
          </Suspense>
        </nav>
      </header>
      <main className={mainClassName ?? (variant === "calm" ? "calm-main" : undefined)}>{children}</main>
      <footer className="dazi-footer">
        <span>{demo ? "FICTIONAL DEMO DATA · NO INVITES ARE SENT" : "GOOD PLANS. BETTER COMPANY."}</span>
        <Link className="text-button" href="/privacy">
          Privacy ↗
        </Link>
      </footer>
    </div>
  );
}

function Wordmark({ href }: { href: string }) {
  return (
    <Link className="wordmark" href={href}>
      dazi
    </Link>
  );
}

// Signed-in users go to /home (their plan and matches), not the public demo wall.
async function AuthWordmark() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <Wordmark href={data?.claims ? "/home" : "/"} />;
}

function SignedOutLinks() {
  return (
    <>
      <Link className="text-button" href="/login">
        Log in
      </Link>
      <Link className="outline-button" href="/signup">
        Sign up
      </Link>
    </>
  );
}

// Reads the session cookie, so it streams in behind Suspense. Uses getClaims()
// only — getCurrentUser() would redirect, and these links appear on public pages.
async function AuthLinks() {
  await connection(); // per-request: the session check reads cookies and the clock
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return <SignedOutLinks />;
  return (
    <Link className="outline-button" href="/home">
      Home
    </Link>
  );
}
