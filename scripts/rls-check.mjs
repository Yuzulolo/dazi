// Two-account Row Level Security check for profiles, posts and matching.
// Talks to Supabase through the public Data API with the anon key — exactly
// what any browser (or attacker) can do. Never prints keys or passwords.
//
// Run from the project folder:
//   node --env-file=.env.local scripts/rls-check.mjs
//   (add --quota to also test the 20-per-day AI limit; spends test account B's quota for 24 h)
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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
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

  // ======================= posts (phase 3) =======================
  // Posts are owner-only; users can't INSERT/UPDATE them directly — only publish_post /
  // update_post (security definer, pinned to auth.uid()), and a trigger enforces content rules.
  // Real posts are never touched: publish tests run as whichever test account has no
  // active post, and every test post is deleted again at the end.
  console.log("\nRow Level Security check: posts (phase 3)\n");
  const vector = `[${Array(1536).fill(0.01).join(",")}]`;
  const basePost = {
    raw_text: "RLS check post", city: "Berlin", start_date: "2030-01-10", end_date: "2030-01-12",
    interests: ["cafes"], budget: null, vibe: null, headline: ["RLS check.", "Please ignore."], tone: "mint",
  };
  const args = (p) => ({
    p_raw_text: p.raw_text, p_city: p.city, p_start_date: p.start_date, p_end_date: p.end_date,
    p_interests: p.interests, p_budget: p.budget, p_vibe: p.vibe, p_headline: p.headline, p_tone: p.tone,
  });
  const publish = (client, overrides = {}) =>
    client.rpc("publish_post", { ...args({ ...basePost, ...overrides }), p_ai_assisted: false, p_embedding: vector });
  const updatePost = (client, overrides = {}) =>
    client.rpc("update_post", { ...args({ ...basePost, ...overrides }), p_embedding: null });
  const hasActive = async (who) =>
    (await who.client.from("posts").select("id").eq("status", "active").maybeSingle()).data !== null;

  // The writer must have no active post (so a publish never archives a real one).
  const [aBusy, bBusy] = [await hasActive(A), await hasActive(B)];
  const writer = !aBusy ? A : !bBusy ? B : null;
  const other = writer === A ? B : A;
  const W = writer === A ? "A" : "B";
  const O = writer === A ? "B" : "A";
  const createdPosts = [];
  try {
    // --- direct writes are refused for everyone ---
    {
      const { error } = await A.client.from("posts").insert({ ...basePost, user_id: A.id, embedding: vector });
      report(/permission denied/.test(error?.message ?? ""), "Direct INSERT into posts is refused", error?.message ?? "insert succeeded!");
    }
    {
      const { data, error } = await A.client.from("posts").update({ raw_text: "WhatsApp +49 170 1234567" }).eq("user_id", A.id).select("id");
      report(/permission denied/.test(error?.message ?? ""), "Direct UPDATE of posts is refused (e.g. adding a phone number)", error?.message ?? `${data?.length} rows changed!`);
    }
    {
      const { error } = await A.client.from("posts").update({ status: "active" }).eq("status", "archived");
      report(/permission denied/.test(error?.message ?? ""), "Direct status change (archived → active) is refused", error?.message ?? "update succeeded!");
    }

    // --- the database's own content rules, through the official write path ---
    // A failed publish rolls back completely, so these are safe even with a real active post.
    for (const [label, values, expected] of [
      ["publish_post rejects a phone number in the plan text", { raw_text: "Berlin, text me at 0151 2345678" }, "Contact details are not allowed"],
      ["publish_post rejects an email in the headline", { headline: ["Mail a@b.de.", "Thanks."] }, "Contact details are not allowed"],
      ["publish_post rejects a start date in the past", { start_date: "2020-01-10", end_date: "2020-01-12" }, "cannot start in the past"],
      ["publish_post rejects an unknown poster tone", { tone: "orange" }, "posts_tone_check"],
      ["publish_post rejects an unknown interest", { interests: ["skydiving"] }, "posts_interests_check"],
      ["publish_post rejects a headline line over 22 characters", { headline: ["This line is far too long.", "Ok."] }, "posts_headline_check"],
      ["publish_post rejects a trip that ends before it starts", { start_date: "2030-01-12", end_date: "2030-01-10" }, "posts_date_order"],
    ]) {
      const { data, error } = await publish(A.client, values);
      if (data) createdPosts.push(data);
      report((error?.message ?? "").includes(expected), label, error?.message ?? "publish succeeded!");
    }

    if (!writer) {
      console.log("SKIP  publish/update success checks: both test accounts have a real active post (left untouched)");
    } else {
      const { data: firstId, error: firstError } = await publish(writer.client);
      if (firstId) createdPosts.push(firstId);
      report(Boolean(firstId) && !firstError, `${W} can publish a post (publish_post)`, firstError?.message ?? "1 post created");

      const { data: secondId, error: secondError } = await publish(writer.client, { headline: ["Second post.", "Please ignore."] });
      if (secondId) createdPosts.push(secondId);
      const { data: first } = await writer.client.from("posts").select("status").eq("id", firstId).single();
      report(!secondError && first?.status === "archived", "publish_post archives the previous active post (one active post)", secondError?.message ?? `first post is now ${first?.status}`);

      {
        const { data, error } = await updatePost(writer.client, { city: "Hamburg" });
        const { data: row } = await writer.client.from("posts").select("city").eq("id", secondId).single();
        report(!error && data === secondId && row?.city === "Hamburg", `${W} can edit the active post (update_post)`, error?.message ?? `city is now ${row?.city}`);
      }
      {
        const { error } = await updatePost(writer.client, { vibe: "call me on 0151 2345678" });
        report((error?.message ?? "").includes("Contact details are not allowed"), "update_post rejects a phone number", error?.message ?? "update succeeded!");
      }
      {
        const { data, error } = await other.client.from("posts").select("id, city").eq("user_id", writer.id);
        report(!error && data?.length === 0, `${O} can NOT read ${W}'s posts directly (owner-only)`, error?.message ?? `${data?.length} rows visible`);
      }
      {
        const { data, error } = await other.client.from("posts").delete().eq("user_id", writer.id).select("id");
        const { data: still } = await writer.client.from("posts").select("id").in("id", createdPosts);
        report((Boolean(error) || data?.length === 0) && still?.length === createdPosts.length, `${O} cannot delete ${W}'s posts`, error?.message ?? `${data?.length} rows deleted`);
      }
    }

    {
      const { error } = await A.client.from("posts").select("embedding").limit(1);
      report(Boolean(error), "Nobody can read the embedding column, not even the owner", error?.message ?? "embedding readable!");
    }
    {
      const { error } = await anon.from("posts").select("id").limit(1);
      report(Boolean(error), "Signed-out (anon) cannot read posts", error?.message ?? "read succeeded!");
    }
    for (const fn of ["publish_post", "update_post", "consume_ai_quota"]) {
      const params = fn === "consume_ai_quota" ? { p_kind: "extract" } : fn === "publish_post"
        ? { ...args(basePost), p_ai_assisted: false, p_embedding: vector } : { ...args(basePost), p_embedding: null };
      const { error } = await anon.rpc(fn, params);
      report(Boolean(error), `Signed-out (anon) cannot call ${fn}`, error?.message ?? "call succeeded!");
    }
    {
      const { data: bogus } = await B.client.rpc("consume_ai_quota", { p_kind: "free_money" });
      report(bogus === false, "consume_ai_quota refuses an unknown kind", `returned ${bogus}`);
      if (process.argv.includes("--quota")) {
        // Opt-in: spends test account B's draft quota for 24 hours.
        let calls = 0;
        let ok = true;
        while (ok && calls < 25) {
          const { data } = await B.client.rpc("consume_ai_quota", { p_kind: "extract" });
          ok = data === true;
          if (ok) calls++;
        }
        report(!ok && calls <= 20, "consume_ai_quota stops at 20 drafts per 24 h (--quota)", `refused after ${calls} successful calls`);
      }
    }
  } finally {
    if (createdPosts.length) {
      const owner = writer ?? A;
      const { error } = await owner.client.from("posts").delete().in("id", createdPosts);
      if (error) console.log(`      WARNING: could not delete test posts: ${error.message}`);
    }
  }

  // ======================= matching (phase 4) =======================
  console.log("\nRow Level Security check: matching (phase 4)\n");
  {
    for (const [fn, params] of [
      ["match_my_post", {}],
      ["match_suggestion", {}],
      ["get_my_match_reasons", { p_candidate_post_ids: [] }],
      ["save_my_match_reasons", { p_reasons: [], p_generated_at: new Date().toISOString() }],
      ["set_my_profile_embedding", { p_embedding: vector }],
      ["match_candidates_for_eval", { p_user: A.id, w_trip: 1, w_style: 0, w_personality: 0 }],
    ]) {
      const { error } = await anon.rpc(fn, params);
      report(Boolean(error), `Signed-out (anon) cannot call ${fn}`, error?.message ?? "call succeeded!");
    }
    const { error: evalError } = await A.client.rpc("match_candidates_for_eval", { p_user: B.id, w_trip: 1, w_style: 0, w_personality: 0 });
    report(Boolean(evalError), "A signed-in user cannot call match_candidates_for_eval (service role only)", evalError?.message ?? "call succeeded!");
    const { error: embError } = await A.client.from("profiles").select("profile_embedding").eq("id", A.id);
    report(Boolean(embError), "Nobody can read profile_embedding, not even their own", embError?.message ?? "readable!");
    const { error: stampError } = await A.client.from("profiles").update({ updated_at: "2000-01-01T00:00:00Z" }).eq("id", A.id);
    report(/permission denied/.test(stampError?.message ?? ""), "Clients cannot write profiles.updated_at (set only by the trigger)", stampError?.message ?? "update succeeded!");
    const { error: demoError } = await A.client.from("profiles").update({ is_demo: true }).eq("id", A.id);
    report(/permission denied/.test(demoError?.message ?? ""), "Clients cannot set is_demo", demoError?.message ?? "update succeeded!");
  }

  // Mutual preferences: B posts in A's city on A's dates; B's age preference first excludes A,
  // then includes A (positive control). B's profile and post are restored afterwards.
  {
    const { data: aPost } = await A.client.from("posts").select("city, start_date, end_date").eq("status", "active").maybeSingle();
    const bHasActive = (await B.client.from("posts").select("id").eq("status", "active").maybeSingle()).data !== null;
    if (!aPost || bHasActive) {
      console.log(`SKIP  mutual-preference checks: ${!aPost ? "A has no active post" : "B has a real active post (left untouched)"}`);
    } else {
      const SAFE = ["post_id", "headline", "tone", "city", "overlap_start", "overlap_end", "interests", "display_name",
        "age_range", "languages", "is_demo", "travel_pace", "day_rhythm", "shared_interests",
        "trip_score", "style_score", "personality_score", "total_score"].sort().join(",");
      const { data: aPub } = await A.client.from("profiles").select("languages").eq("id", A.id).single();
      const { data: bPrivate } = await B.client.rpc("get_my_private_profile").single();
      const { data: bPub } = await B.client.from("profiles").select("languages").eq("id", B.id).single();
      let bPostId = null;
      try {
        const { data: postId, error: pubError } = await publish(B.client, {
          city: aPost.city, start_date: aPost.start_date < today() ? today() : aPost.start_date, end_date: aPost.end_date,
        });
        if (pubError) throw new Error(`B could not publish the test post: ${pubError.message}`);
        bPostId = postId;
        const setB = (values) => B.client.from("profiles").update(values).eq("id", B.id);
        await setB({ languages: [...new Set([...(bPub?.languages ?? []), ...(aPub?.languages ?? ["en"])])].slice(0, 10), pref_gender: null, pref_age_min: 18, pref_age_max: 19 });
        // Counted over ALL of A's eligible candidates (match_suggestion has no top-10 cut-off),
        // so ranking can't hide or fake the result.
        const eligibleCount = async () => {
          const { data, error } = await A.client.rpc("match_suggestion");
          if (error) throw new Error(`match_suggestion: ${error.message}`);
          return data.find((r) => r.extra_days === 3)?.matches ?? 0;
        };
        const { data: excludedRows, error: e1 } = await A.client.rpc("match_my_post");
        const countExcluded = await eligibleCount();
        report(!e1 && !(excludedRows ?? []).some((r) => r.post_id === bPostId), "A never sees B when A is outside B's age preference (mutual)", e1?.message ?? `B absent from A's top ${(excludedRows ?? []).length}`);
        await setB({ pref_age_min: 18, pref_age_max: 99 });
        const countIncluded = await eligibleCount();
        report(countIncluded === countExcluded + 1, "Positive control: relaxing B's age preference adds exactly B to A's eligible candidates", `${countExcluded} → ${countIncluded}`);
        const { data: rows, error: e2 } = await A.client.rpc("match_my_post");
        const anyRow = (rows ?? [])[0];
        report(!e2 && anyRow && Object.keys(anyRow).sort().join(",") === SAFE, "match_my_post returns only the safe columns", e2?.message ?? (anyRow ? Object.keys(anyRow).filter((k) => !SAFE.includes(k)).join(", ") || "exact safe set" : "no rows to inspect"));
      } finally {
        if (bPostId) await B.client.from("posts").delete().eq("id", bPostId);
        if (bPrivate) {
          await B.client.from("profiles").update({
            languages: bPub?.languages, pref_gender: bPrivate.pref_gender, pref_age_min: bPrivate.pref_age_min, pref_age_max: bPrivate.pref_age_max,
          }).eq("id", B.id);
        }
      }
    }
  }
} finally {
  const { error } = await update(A.client, snapshot);
  if (error) console.log(`      WARNING: could not restore A's profile: ${error.message}`);
}

// ======================= delete my account (phase 5) =======================
// Uses temporary users created with the service role key (local only); each one calls
// delete_my_account() with its OWN session, exactly like the app. Real accounts are never deleted.
console.log("\nRow Level Security check: delete my account (phase 5)\n");
{
  const { error } = await anon.rpc("delete_my_account");
  // Must be refused by the GRANT, not by the function's own "Not signed in" check.
  report(/permission denied for function/.test(error?.message ?? ""), "Signed-out (anon) cannot call delete_my_account", error?.message ?? "call succeeded!");
  const { error: readFlag } = await A.client.from("profiles").select("is_protected").eq("id", A.id);
  report(/permission denied/.test(readFlag?.message ?? ""), "Clients cannot read is_protected", readFlag?.message ?? "readable!");
  const { error: writeFlag } = await A.client.from("profiles").update({ is_protected: true }).eq("id", A.id);
  report(/permission denied/.test(writeFlag?.message ?? ""), "Clients cannot set is_protected", writeFlag?.message ?? "update succeeded!");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("SKIP  deletion tests with temporary users: SUPABASE_SERVICE_ROLE_KEY is not in .env.local");
} else {
  const { adminClient } = await import("./lib/admin.mjs");
  const admin = adminClient();
  const temps = [];
  const year = Number(today().slice(0, 4));
  async function tempUser(flags = {}) {
    // Same prefix scripts/lib/admin.mjs recognises, so `seed-demo --cleanup` removes leftovers.
    const email = `delete-test-${crypto.randomUUID().slice(0, 8)}@dazi-demo.invalid`;
    const password = `${crypto.randomUUID()}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: "Delete test", birth_year: year - 30 },
    });
    if (error) throw new Error(`temp user: ${error.message}`);
    temps.push(data.user.id);
    const { error: pe } = await admin.from("profiles").update({
      languages: ["en"], home_city: "Testtown", travel_pace: 3, day_rhythm: "flexible", travel_interests: ["cafes"],
      onboarding_completed_at: new Date().toISOString(), ...flags,
    }).eq("id", data.user.id);
    if (pe) throw new Error(`temp profile: ${pe.message}`);
    const client = newClient();
    const { error: se } = await client.auth.signInWithPassword({ email, password });
    if (se) throw new Error(`temp sign-in: ${se.message}`);
    return { id: data.user.id, client };
  }
  try {
    const { count: aPostsBefore } = await A.client.from("posts").select("id", { count: "exact", head: true });

    // 1. A normal user deletes themself: auth user, profile and plans are gone.
    const t = await tempUser();
    const { data: postId, error: pubError } = await t.client.rpc("publish_post", {
      p_raw_text: "Delete test plan", p_city: "Testtown", p_start_date: today(), p_end_date: today(),
      p_interests: ["cafes"], p_budget: null, p_vibe: null, p_headline: ["Delete test.", "Ignore."], p_tone: "mint",
      p_ai_assisted: false, p_embedding: `[${Array(1536).fill(0.01).join(",")}]`,
    });
    if (pubError) throw new Error(`temp publish: ${pubError.message}`);
    const { error: delError } = await t.client.rpc("delete_my_account");
    const { data: authAfter } = await admin.auth.admin.getUserById(t.id);
    const { data: profAfter } = await admin.from("profiles").select("id").eq("id", t.id);
    const { data: postsAfter } = await admin.from("posts").select("id").eq("id", postId);
    report(!delError && !authAfter?.user && profAfter?.length === 0 && postsAfter?.length === 0,
      "delete_my_account really deletes the caller: auth user, profile and plans are gone",
      delError?.message ?? `auth user ${authAfter?.user ? "STILL EXISTS" : "gone"}, profile rows ${profAfter?.length}, plan rows ${postsAfter?.length}`);

    // 2. ...and only the caller: A is untouched.
    const { data: aProfile } = await A.client.from("profiles").select("id").eq("id", A.id);
    const { count: aPostsAfter } = await A.client.from("posts").select("id", { count: "exact", head: true });
    report(aProfile?.length === 1 && aPostsAfter === aPostsBefore, "Deleting one account leaves other users untouched (A's profile and plans)",
      `A profile rows ${aProfile?.length}, A plans ${aPostsBefore} → ${aPostsAfter}`);

    // 3. Protected (the public demo login) and demo accounts are refused and still exist.
    for (const [label, flags] of [["a protected account", { is_protected: true }], ["a demo account (is_demo)", { is_demo: true }]]) {
      const u = await tempUser(flags);
      const { error } = await u.client.rpc("delete_my_account");
      const { data: still } = await admin.auth.admin.getUserById(u.id);
      report((error?.message ?? "").includes("cannot be deleted") && Boolean(still?.user), `delete_my_account refuses ${label}`,
        error?.message ?? "deleted!");
    }
  } finally {
    for (const id of temps) {
      const { error } = await admin.auth.admin.deleteUser(id);
      // The user deleted by delete_my_account is already gone ("not found") — that's fine.
      if (error && !/not.?found/i.test(error.message)) console.log(`      WARNING: could not remove temporary user ${id}: ${error.message}`);
    }
  }
}

// ======================= security scan fixes (phase 6) =======================
console.log("\nRow Level Security check: security scan fixes (phase 6)\n");
{
  // (2) A can still edit their own profile — the new profiles_guard trigger must not block it.
  const { data: before } = await A.client.from("profiles").select("bio").eq("id", A.id).single();
  const { data: upd, error: updError } = await A.client.from("profiles").update({ bio: "RLS check bio (temporary)" }).eq("id", A.id).select("id");
  report(!updError && upd?.length === 1, "A can still update own bio (profiles_guard allows normal edits)", updError?.message ?? "1 row changed");
  // H1: the database itself refuses contact details in profile text.
  for (const [label, values] of [
    ["a phone number in the bio", { bio: "WhatsApp +49 151 23456789" }],
    ["an email in the display name", { display_name: "mail me a@b.de" }],
    ["a phone number in hobbies", { hobbies: ["call 0151 2345678"] }],
  ]) {
    const { error } = await A.client.from("profiles").update(values).eq("id", A.id);
    report((error?.message ?? "").includes("Contact details are not allowed in profiles"), `The database refuses ${label} (profiles_guard)`, error?.message ?? "update succeeded!");
  }
  await A.client.from("profiles").update({ bio: before?.bio ?? null }).eq("id", A.id);

  // (3) The private schema is not reachable through the Data API.
  const { error: privError } = await anon.schema("private").from("ai_calls").select("user_id").limit(1);
  report(Boolean(privError), "Signed-out request to the private schema (Accept-Profile: private) is rejected", privError?.message ?? "readable!");
  const { error: privAuthError } = await A.client.schema("private").from("match_reasons").select("reason").limit(1);
  report(Boolean(privAuthError), "Signed-in request to the private schema is rejected", privAuthError?.message ?? "readable!");

  // M1: only the service role may clear the demo account's AI counters.
  const { error: resetError } = await A.client.rpc("reset_demo_ai_quota");
  report(/permission denied for function/.test(resetError?.message ?? ""), "Signed-in users cannot call reset_demo_ai_quota (service role only)", resetError?.message ?? "call succeeded!");
  const { error: resetAnon } = await anon.rpc("reset_demo_ai_quota");
  report(/permission denied for function/.test(resetAnon?.message ?? ""), "Signed-out (anon) cannot call reset_demo_ai_quota", resetAnon?.message ?? "call succeeded!");

  // L1: at most 10 reasons per call.
  const eleven = Array.from({ length: 11 }, () => ({ post_id: crypto.randomUUID(), reason: "x" }));
  const { error: capError } = await A.client.rpc("save_my_match_reasons", { p_reasons: eleven, p_generated_at: new Date().toISOString() });
  report((capError?.message ?? "").includes("At most 10 reasons"), "save_my_match_reasons refuses more than 10 items", capError?.message ?? "accepted!");
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { adminClient } = await import("./lib/admin.mjs");
  const admin = adminClient();
  const year = Number(today().slice(0, 4));
  const made = [];
  try {
    // (1) A real sign-up still works: creating an auth user runs the same database path as the
    // public sign-up (auth.users insert → handle_new_user → profiles insert → profiles_guard).
    const email = `delete-test-${crypto.randomUUID().slice(0, 8)}@dazi-demo.invalid`;
    const { data: created, error: signUpError } = await admin.auth.admin.createUser({
      email, password: `${crypto.randomUUID()}Aa1!`, email_confirm: true,
      user_metadata: { display_name: "Sign-up check", birth_year: year - 30 },
    });
    if (created?.user) made.push(created.user.id);
    const { data: prof } = created?.user ? await admin.from("profiles").select("id").eq("id", created.user.id) : { data: [] };
    report(!signUpError && prof?.length === 1, "A real sign-up still works after the migration (profile row created)", signUpError?.message ?? `${prof?.length} profile row`);

    // M2: A cannot read a profile that hasn't finished onboarding.
    const { data: seen, error: seenError } = created?.user
      ? await A.client.from("profiles").select("id").eq("id", created.user.id)
      : { data: null, error: { message: "no temporary user" } };
    report(!seenError && seen?.length === 0, "A cannot read a profile that hasn't finished onboarding", seenError?.message ?? `${seen?.length} rows visible`);

    // H1 on sign-up: a display name with contact details is refused by the database too
    // (the app's sign-up form shows a friendly error before it ever gets here).
    const { data: bad, error: badError } = await admin.auth.admin.createUser({
      email: `delete-test-${crypto.randomUUID().slice(0, 8)}@dazi-demo.invalid`, password: `${crypto.randomUUID()}Aa1!`, email_confirm: true,
      user_metadata: { display_name: "call 0151 23456789", birth_year: year - 30 },
    });
    if (bad?.user) made.push(bad.user.id);
    report(Boolean(badError) && !bad?.user, "A sign-up with contact details in the name is refused by the database", badError?.message ?? "user created!");
  } finally {
    for (const id of made) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not.?found/i.test(error.message)) console.log(`      WARNING: could not remove temporary user ${id}: ${error.message}`);
    }
  }
}

await Promise.all([A.client.auth.signOut(), B.client.auth.signOut()]);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
