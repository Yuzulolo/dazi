"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailAddress } from "@/lib/profile/contact";
import { parseBirthYear, parseDisplayName } from "@/lib/profile/validate";

export type SignUpState = {
  error?: string;
  done?: boolean;
  // Echoed back so the form keeps what the user typed (never the password).
  fields?: { displayName: string; birthYear: string; email: string };
};

export type SignInState = {
  error?: string;
  email?: string;
};

export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fields = { displayName, birthYear: birthYearRaw, email };

  const nameError = parseDisplayName(displayName);
  if (nameError) return { error: nameError, fields };
  // Strict 18+ rule (FLOWS 2.0), same check as onboarding; the database trigger
  // enforces it too. Refused here before contacting Supabase: nothing is stored.
  const birth = parseBirthYear(birthYearRaw);
  if (!birth.ok) return { error: birth.error, fields };
  const birthYear = birth.year;
  if (!isEmailAddress(email)) {
    return { error: "Please enter a valid email address.", fields };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", fields };
  }

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error("SITE_URL is not set");
    return { error: "Sign-up is temporarily unavailable. Please try again later.", fields };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Copied into public.profiles by the handle_new_user trigger.
      data: { display_name: displayName, birth_year: birthYear },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    console.error("signUp failed:", error.code ?? error.message);
    return { error: "Could not create your account. Please try again.", fields };
  }

  // Same message whether or not the email was already registered,
  // so the form can't be used to find out who has an account.
  return { done: true };
}

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first — check your inbox.", email };
    }
    return { error: "Invalid email or password.", email };
  }

  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// "Try the demo account": signs in as the public demo login on the server. The
// credentials are server-only env vars (DEMO_EMAIL / DEMO_PASSWORD, never NEXT_PUBLIC_).
// Every demo sign-in comes from Vercel's servers, so Supabase's auth rate limit can kick
// in — any failure shows a friendly "busy" message on the homepage, never an error page.
export async function signInDemo() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) redirect("/?demo=unavailable");
  const supabase = await createClient();
  // Already signed in: never silently swap someone's own session for the demo (review W6).
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub) redirect("/home");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Wrong credentials usually means a visitor changed the demo password: say "unavailable"
    // (run scripts/reset-demo-account.mjs). Anything else (e.g. auth rate limit): "busy".
    const wrongPassword = error.code === "invalid_credentials";
    console.error(wrongPassword ? "demo sign-in failed: invalid credentials — run reset-demo-account" : `demo sign-in failed: ${error.code ?? error.status}`);
    redirect(wrongPassword ? "/?demo=unavailable" : "/?demo=busy");
  }
  redirect("/home");
}
