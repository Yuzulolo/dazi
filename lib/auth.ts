import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  displayName: string;
};

// The one place protected pages and server actions get the signed-in user.
// Reads the session cookie, so call it inside a <Suspense> boundary.
// Users without a birth year (e.g. a future Google sign-up, Roadmap) are sent to /onboarding
// first (FLOWS 2.0). Only the onboarding page itself passes allowMissingBirthYear.
export async function getCurrentUser(
  { allowMissingBirthYear = false }: { allowMissingBirthYear?: boolean } = {},
): Promise<CurrentUser> {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, birth_year")
    .eq("id", userId)
    .single();
  // Signed in but no profile: sign out first, otherwise /login -> /home loops.
  if (!profile) redirect("/auth/signout");
  if (profile.birth_year === null && !allowMissingBirthYear) redirect("/onboarding");

  return { id: userId, displayName: profile.display_name };
}
