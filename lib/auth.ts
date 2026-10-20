import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  displayName: string;
  onboarded: boolean;
  accountCreatedAt: string; // profile creation time (decides whose homepage draft it is)
  isDemoLogin: boolean; // the shared public demo account (server-side check, no email in code)
};

// The shared demo login is recognised by the server-only DEMO_EMAIL env var.
function isDemoEmail(email: unknown) {
  return Boolean(process.env.DEMO_EMAIL) && email === process.env.DEMO_EMAIL;
}

// The one place protected pages and server actions get the signed-in user.
// Reads the session cookie, so call it inside a <Suspense> boundary.
// Onboarding gate (FLOWS 2.0): users who haven't completed onboarding are sent
// to /onboarding. Only the onboarding page and its actions pass allowIncompleteOnboarding.
// Reads public columns only (birth_year, gender and pref_* are private column grants).
export async function getCurrentUser(
  { allowIncompleteOnboarding = false }: { allowIncompleteOnboarding?: boolean } = {},
): Promise<CurrentUser> {
  await connection(); // per-request: the session check reads cookies and the clock
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_completed_at, created_at")
    .eq("id", userId)
    .single();
  // Signed in but no profile: sign out first, otherwise /login -> /plan loops.
  if (!profile) redirect("/auth/signout");

  const onboarded = profile.onboarding_completed_at !== null;
  if (!onboarded && !allowIncompleteOnboarding) redirect("/onboarding");

  return {
    id: userId,
    displayName: profile.display_name,
    onboarded,
    accountCreatedAt: profile.created_at,
    isDemoLogin: isDemoEmail(data?.claims?.email),
  };
}

export type Viewer =
  | { status: "guest" }
  | { status: "onboarding" | "member"; userId: string; isDemoLogin: boolean };

// Who is looking at a PUBLIC page (e.g. the homepage) — never redirects.
// Decided on the server from the session cookie.
export async function getViewer(): Promise<Viewer> {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { status: "guest" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  return {
    status: profile?.onboarding_completed_at ? "member" : "onboarding",
    userId,
    isDemoLogin: isDemoEmail(data?.claims?.email),
  };
}
