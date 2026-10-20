import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { InfoButton } from "./info-dialog";
import { HOW_IT_WORKS } from "./copy";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./auth-buttons";
import { messagingEnabled } from "@/lib/messaging/flag";
import { getPendingInviteCount } from "@/lib/messaging/queries";

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
        <Link className="wordmark" href="/">
          dazi
        </Link>
        <span className="header-note">LITTLE PLANS, GOOD COMPANY.</span>
        <nav aria-label="Main navigation">
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

function SignedOutLinks() {
  return (
    <>
      <InfoButton content={HOW_IT_WORKS}>How it works</InfoButton>
      <Link className="text-button" href="/login">
        Log in
      </Link>
      <Link className="outline-button" href="/signup">
        Sign up
      </Link>
    </>
  );
}

// Reads the session cookie, so it streams in behind Suspense. Uses getViewer(),
// which never redirects — these links appear on public pages too.
// Members: My plan · Matches · Profile (Settings, How it works and Sign out live on
// their own profile page). Not yet onboarded: Finish profile · Sign out.
async function AuthLinks() {
  const viewer = await getViewer();
  if (viewer.status === "guest") return <SignedOutLinks />;
  if (viewer.status === "onboarding") {
    return (
      <>
        <NavLink href="/onboarding">Finish profile</NavLink>
        <SignOutButton />
      </>
    );
  }
  // Phase 7b-1: number of open invites I received, only when messaging is enabled.
  const invites = messagingEnabled() ? await getPendingInviteCount() : 0;
  return (
    <>
      <NavLink
        href="/plan"
        label={invites > 0 ? `My plan, ${invites} new ${invites === 1 ? "invite" : "invites"}` : undefined}
      >
        My plan
        {invites > 0 && (
          <span className="nav-badge" aria-hidden="true">
            {invites}
          </span>
        )}
      </NavLink>
      <NavLink href="/matches">Matches</NavLink>
      <NavLink href={`/u/${viewer.userId}`}>Profile</NavLink>
    </>
  );
}
