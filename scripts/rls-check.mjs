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

// ================= Phase 2: profile privacy + onboarding =================
// A's editable fields are snapshotted first and restored at the end, so the
// script works whether or not A has finished onboarding and leaves A unchanged.

console.log("\nRow Level Security check: profile privacy (phase 2)\n");

const PUBLIC_COLUMNS =
  "languages, home_city, bio, visited_cities, hobbies, travel_pace, day_rhythm, travel_interests, onboarding_completed_at";
const PRIVATE_COLUMNS = ["birth_year", "gender", "pref_age_min", "pref_age_max", "pref_gender"];

async function snapshotA() {
  const { data: pub, error: pubError } = await A.client.from("profiles").select(PUBLIC_COLUMNS).eq("id", A.id).single();
  const { data: priv, error: privError } = await A.client.rpc("get_my_private_profile").single();
  if (pubError || privError) {
    console.error(`Could not snapshot A's profile: ${(pubError ?? privError).message}`);
    process.exit(1);
  }
  // birth_year is left out on purpose: it is locked and never written.
  return {
    ...pub,
    gender: priv.gender,
    pref_age_min: priv.pref_age_min,
    pref_age_max: priv.pref_age_max,
    pref_gender: priv.pref_gender,
  };
}

const snapshot = await snapshotA();
const update = (client, values, id = A.id) => client.from("profiles").update(values).eq("id", id);

try {
  // Database onboarding gate: completing onboarding with required fields missing is refused.
  {
    const { error } = await update(A.client, {
      languages: [],
      onboarding_completed_at: new Date().toISOString(),
    });
    report(Boolean(error), "Onboarding can't be completed with required fields missing", error?.message ?? "update succeeded!");
  }

  // Make sure A is onboarded (minimal valid answers) so A appears in public_profiles.
  if (!snapshot.onboarding_completed_at) {
    const { error } = await update(A.client, {
      languages: ["en"],
      home_city: "Berlin",
      travel_pace: 3,
      day_rhythm: "flexible",
      travel_interests: ["cafes"],
      onboarding_completed_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`Could not prepare A for the checks: ${error.message}`);
      process.exit(1);
    }
  }

  // B cannot read any of A's private columns.
  {
    const leaked = [];
    for (const column of PRIVATE_COLUMNS) {
      const { error } = await B.client.from("profiles").select(column).eq("id", A.id);
      if (!error) leaked.push(column);
    }
    report(
      leaked.length === 0,
      "B cannot read A's birth_year, gender or preferences",
      leaked.length ? `readable: ${leaked.join(", ")}` : "permission denied for all 5 columns",
    );
  }

  // B cannot use select=* to get them either.
  {
    const { error } = await B.client.from("profiles").select("*").eq("id", A.id);
    report(Boolean(error), "B cannot select * on profiles", error?.message ?? "select * succeeded!");
  }

  // B cannot filter by birth year (would leak it one guess at a time).
  {
    const { error } = await B.client.from("profiles").select("id").eq("birth_year", 1995);
    report(Boolean(error), "B cannot filter profiles by birth_year", error?.message ?? "filter succeeded!");
  }

  // B sees A in public_profiles with an age range only.
  {
    const { data, error } = await B.client.from("public_profiles").select("id, age_range").eq("id", A.id);
    const ageRange = data?.[0]?.age_range;
    report(
      !error && /^(\d{2}–\d{2}|60\+)$/.test(ageRange ?? ""),
      "B sees A's age range in public_profiles",
      error ? error.message : `age_range: ${ageRange}`,
    );
    const { error: yearError } = await B.client.from("public_profiles").select("birth_year").eq("id", A.id);
    report(Boolean(yearError), "public_profiles has no birth_year column", yearError?.message ?? "birth_year returned!");
  }

  // get_my_private_profile() returns the caller's own row only (marker value proves whose).
  {
    const { error: markError } = await update(A.client, { pref_age_max: 97 });
    const { data: mine } = await A.client.rpc("get_my_private_profile");
    const { data: theirs } = await B.client.rpc("get_my_private_profile");
    report(
      !markError && mine?.length === 1 && mine[0].pref_age_max === 97,
      "A's get_my_private_profile() returns A's own row",
      markError?.message ?? `${mine?.length} row(s), marker found: ${mine?.[0]?.pref_age_max === 97}`,
    );
    report(
      theirs?.length === 1 && theirs[0].pref_age_max !== 97,
      "B's get_my_private_profile() returns only B's row",
      `${theirs?.length} row(s), A's marker absent: ${theirs?.[0]?.pref_age_max !== 97}`,
    );
  }

  // Signed-out visitors get nothing.
  {
    const { error: viewError } = await anon.from("public_profiles").select("id");
    report(Boolean(viewError), "Signed-out (anon) cannot read public_profiles", viewError?.message ?? "read succeeded!");
    const { error: rpcError } = await anon.rpc("get_my_private_profile");
    report(Boolean(rpcError), "Signed-out (anon) cannot call get_my_private_profile", rpcError?.message ?? "call succeeded!");
  }

  // B cannot edit A's profile.
  {
    const { data: before } = await A.client.from("profiles").select("bio").eq("id", A.id).single();
    const { data, error } = await B.client.from("profiles").update({ bio: "hacked" }).eq("id", A.id).select("id");
    const { data: after } = await A.client.from("profiles").select("bio").eq("id", A.id).single();
    report(
      (error || data?.length === 0) && after?.bio === before?.bio,
      "B cannot update A's bio",
      error ? error.message : `${data?.length} rows changed, A's bio unchanged: ${after?.bio === before?.bio}`,
    );
  }

  // The database rejects invalid values even if the app is bypassed.
  for (const [label, values] of [
    ["A cannot set an unknown travel interest", { travel_interests: ["skydiving"] }],
    ["A cannot set an unknown language", { languages: ["xx"] }],
    ["A cannot set pref_age_min below 18", { pref_age_min: 10 }],
    ["A cannot set pref_age_min above pref_age_max", { pref_age_min: 60, pref_age_max: 30 }],
    ["A cannot change own birth_year (locked)", { birth_year: 1990 }],
    ["A cannot clear languages while onboarded", { languages: [] }],
  ]) {
    const { error } = await update(A.client, values);
    report(Boolean(error), label, error?.message ?? "update succeeded!");
  }
} finally {
  const { error } = await update(A.client, snapshot);
  if (error) console.log(`      WARNING: could not restore A's profile: ${error.message}`);
}

await Promise.all([A.client.auth.signOut(), B.client.auth.signOut()]);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
