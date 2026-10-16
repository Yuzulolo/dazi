import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  displayName: string;
};

// The one place protected pages and server actions get the signed-in user.
// Reads the session cookie, so call it inside a <Suspense> boundary.
// Only reads public profile columns: birth_year becomes private in phase 2 (part B),
// where the onboarding gate (FLOWS 2.0) moves to onboarding_completed_at.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  // Signed in but no profile: sign out first, otherwise /login -> /home loops.
  if (!profile) redirect("/auth/signout");

  return { id: userId, displayName: profile.display_name };
}
