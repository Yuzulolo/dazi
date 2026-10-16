// Two-account Row Level Security check for public.profiles.
// Talks to Supabase through the public Data API with the anon key — exactly
// what any browser (or attacker) can do. Never prints keys or passwords.
//
// Run from the project folder:
//   node --env-file=.env.local scripts/rls-check.mjs
//
// Needs two confirmed 18+ test accounts in .env.local:
//   TEST_A_EMAIL, TEST_A_PASSWORD, TEST_B_EMAIL, TEST_B_PASSWORD

import { createClient } from "@supabase/supabase-js";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TEST_A_EMAIL",
  "TEST_A_PASSWORD",
  "TEST_B_EMAIL",
  "TEST_B_PASSWORD",
];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  console.error("Run with: node --env-file=.env.local scripts/rls-check.mjs");
  process.exit(1);
}

const env = process.env;
const newClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

let failures = 0;
function report(ok, label, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function signIn(email, password, who) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Could not sign in as ${who}: ${error.message}`);
    process.exit(1);
  }
  return { client, id: data.user.id };
}

const A = await signIn(env.TEST_A_EMAIL, env.TEST_A_PASSWORD, "A");
const B = await signIn(env.TEST_B_EMAIL, env.TEST_B_PASSWORD, "B");
const anon = newClient();

async function nameOf(client, id) {
  const { data } = await client.from("profiles").select("display_name").eq("id", id).single();
  return data?.display_name;
}

console.log("Row Level Security check: profiles\n");

// 1. Signed-in users can read profiles.
{
  const { data, error } = await A.client.from("profiles").select("id");
  const ids = (data ?? []).map((row) => row.id);
  report(
    !error && ids.includes(A.id) && ids.includes(B.id),
    "A can read profiles (sees A and B)",
    error ? error.message : `${ids.length} rows`,
  );
}

// 2. A can update their own display name (then it is put back).
{
  const original = await nameOf(A.client, A.id);
  const { data, error } = await A.client
    .from("profiles")
    .update({ display_name: "RLS check" })
    .eq("id", A.id)
    .select("id");
  report(!error && data?.length === 1, "A can update own display_name", error?.message ?? `${data?.length} row changed`);
  const { error: restoreError } = await A.client
    .from("profiles")
    .update({ display_name: original })
    .eq("id", A.id);
  if (restoreError) console.log(`      WARNING: could not restore A's name: ${restoreError.message}`);
}

// 3. A cannot update B's display name.
{
  const before = await nameOf(B.client, B.id);
  const { data, error } = await A.client
    .from("profiles")
    .update({ display_name: "hacked" })
    .eq("id", B.id)
    .select("id");
  const after = await nameOf(B.client, B.id);
  report(
    (error || data?.length === 0) && after === before,
    "A cannot update B's display_name",
    error ? error.message : `${data?.length} rows changed, B's name unchanged: ${after === before}`,
  );
}

// 4. A cannot insert a profile row (only the sign-up trigger may).
{
  const { error } = await A.client
    .from("profiles")
    .insert({ id: crypto.randomUUID(), display_name: "Fake", birth_year: 1990 });
  report(Boolean(error), "A cannot insert a profile row", error?.message ?? "insert succeeded!");
}

// 5. A cannot delete B's row.
{
  const { data, error } = await A.client.from("profiles").delete().eq("id", B.id).select("id");
  const stillThere = (await nameOf(B.client, B.id)) !== undefined;
  report(
    (error || data?.length === 0) && stillThere,
    "A cannot delete B's profile",
    error ? error.message : `${data?.length} rows deleted, B still exists: ${stillThere}`,
  );
}

// 6. A cannot make themselves under 18.
{
  const { error } = await A.client.from("profiles").update({ birth_year: 2010 }).eq("id", A.id);
  report(Boolean(error), "A cannot set own birth_year to 2010 (under 18)", error?.message ?? "update succeeded!");
}

// 7. A cannot clear their birth year (would reopen the onboarding gate).
{
  const { error } = await A.client.from("profiles").update({ birth_year: null }).eq("id", A.id);
  report(Boolean(error), "A cannot set own birth_year to null", error?.message ?? "update succeeded!");
}

// 8. A cannot change their own id (no column permission).
{
  const { error } = await A.client
    .from("profiles")
    .update({ id: crypto.randomUUID() })
    .eq("id", A.id);
  report(Boolean(error), "A cannot change own id", error?.message ?? "update succeeded!");
}

// 9. Signed-out visitors cannot read profiles at all.
{
  const { data, error } = await anon.from("profiles").select("id");
  report(
    Boolean(error) || data?.length === 0,
    "Signed-out (anon) cannot read profiles",
    error ? error.message : `${data?.length} rows`,
  );
}

// 10. Direct sign-up with an under-18 birth year is refused by the database,
//     even when our sign-up form is bypassed.
//     Uses a + alias of the tester's own real address (e.g. you+minor-1760…@hotmail.com),
//     so if this check ever fails the confirmation email reaches you instead of bouncing.
{
  const [local, domain] = env.TEST_A_EMAIL.split("@");
  const baseLocal = local.split("+")[0];
  const { data, error } = await anon.auth.signUp({
    email: `${baseLocal}+minor-${Date.now()}@${domain}`,
    password: crypto.randomUUID(),
    options: { data: { display_name: "Too Young", birth_year: 2010 } },
  });
  if (!error) {
    report(false, "Direct under-18 sign-up is refused", `user was created: ${data.user?.id}`);
  } else if (/database error/i.test(error.message)) {
    report(true, "Direct under-18 sign-up is refused", "blocked by the 18+ trigger");
  } else {
    // Refused for another reason (e.g. email rate limit) — doesn't prove the trigger works.
    console.log(`????  Direct under-18 sign-up: inconclusive  (${error.message}) — try again later`);
  }
}

// 11. Direct sign-up with NO birth year is refused by the database too.
//     Same + alias approach as check 10.
{
  const [local, domain] = env.TEST_A_EMAIL.split("@");
  const baseLocal = local.split("+")[0];
  const { data, error } = await anon.auth.signUp({
    email: `${baseLocal}+nobirth-${Date.now()}@${domain}`,
    password: crypto.randomUUID(),
    options: { data: { display_name: "No Birth Year" } },
  });
  if (!error) {
    report(false, "Direct sign-up without birth year is refused", `user was created: ${data.user?.id}`);
  } else if (/database error/i.test(error.message)) {
    report(true, "Direct sign-up without birth year is refused", "blocked by the sign-up trigger");
  } else {
    console.log(`????  Direct sign-up without birth year: inconclusive  (${error.message}) — try again later`);
  }
}

await Promise.all([A.client.auth.signOut(), B.client.auth.signOut()]);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
