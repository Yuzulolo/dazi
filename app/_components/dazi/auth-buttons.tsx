"use client";

import { signInDemo, signOut } from "@/app/auth/actions";
import { clearPlanDraft } from "./plan-draft";

// Sign out also clears the guest plan draft kept in this browser.
export function SignOutButton() {
  return (
    <form action={signOut} onSubmit={() => clearPlanDraft()}>
      <button type="submit" className="text-button">
        Sign out
      </button>
    </form>
  );
}

export function DemoButton({ className = "outline-button", label = "Try the demo account" }: { className?: string; label?: string }) {
  return (
    <form action={signInDemo}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
