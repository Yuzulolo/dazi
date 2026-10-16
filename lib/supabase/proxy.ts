import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that need a signed-in user, and pages only for signed-out users.
const PROTECTED_PREFIXES = ["/home"];
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Refreshes the Supabase session cookie on every request and does a quick
// redirect check. This is an optimistic check only — pages verify again.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // No-cache headers so a CDN never serves one user's cookie to another.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims():
  // getClaims() is what refreshes and verifies the session.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  let redirectTo: string | null = null;
  if (!isSignedIn && matches(pathname, PROTECTED_PREFIXES)) redirectTo = "/login";
  if (isSignedIn && matches(pathname, AUTH_PAGES)) redirectTo = "/home";

  if (redirectTo) {
    const redirect = NextResponse.redirect(new URL(redirectTo, request.url));
    // Keep any refreshed cookies + cache headers, or the user gets signed out.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") redirect.headers.set(key, value);
    });
    return redirect;
  }

  return response;
}
