import Link from "next/link";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <SiteShell variant="calm">
      <section className="glass calm-panel" data-width="narrow">
        <h1>Sign up</h1>
        <p className="calm-lead">Good plans. Better company. Dazi is for adults (18+).</p>
        <SignupForm />
        <p className="panel-footer">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>
    </SiteShell>
  );
}
