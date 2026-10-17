import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  displayName: string;
  onboarded: boolean;
};

// The one place protected pages and server actions get the signed-in user.
// Reads the session cookie, so call it inside a <Suspense> boundary.
// Onboarding gate (FLOWS 2.0): users who haven't completed onboarding are sent
// to /onboarding. Only the onboarding page and its actions pass allowIncompleteOnboarding.
// Reads public columns only (birth_year, gender and pref_* are private column grants).
export async function getCurrentUser(
  { allowIncompleteOnboarding = false }: { allowIncompleteOnboarding?: boolean } = {},
): Promise<CurrentUser> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_completed_at")
    .eq("id", userId)
    .single();
  // Signed in but no profile: sign out first, otherwise /login -> /home loops.
  if (!profile) redirect("/auth/signout");

  const onboarded = profile.onboarding_completed_at !== null;
  if (!onboarded && !allowIncompleteOnboarding) redirect("/onboarding");

  return { id: userId, displayName: profile.display_name, onboarded };
}
