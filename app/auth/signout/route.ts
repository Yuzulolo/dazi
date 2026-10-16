import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Used by getCurrentUser() when a signed-in user has no profile row.
// Server Components can't clear cookies, so they redirect here instead of to
// /login (which proxy.ts would bounce back to /home while the session exists).
// Only ever redirects to a fixed path.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?error=account_problem", request.url));
}
