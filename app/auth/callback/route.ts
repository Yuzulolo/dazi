import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the email-confirmation link.
// Exchanges the one-time code for a session cookie, then goes to /plan.
// Always redirects to a fixed path, so the link can't be abused as an open redirect.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/plan", request.url));
    }
    console.error("exchangeCodeForSession failed:", error.code ?? error.message);
  }

  return NextResponse.redirect(new URL("/login?error=link_invalid", request.url));
}
