// Supabase client with the SERVICE ROLE key — LOCAL SCRIPTS ONLY (seed, backfill, eval).
// It bypasses RLS. Never import this from app/ or lib/, never deploy it, never NEXT_PUBLIC_.
// tests/secrets.test.mjs fails if app/ or lib/ ever mention the key.
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Demo/test accounts: exactly demo-NN@ / eval-xxxxxxxx@ / delete-test-xxxxxxxx@ on the reserved .invalid domain (it can
// never receive mail). Destructive paths also require profiles.is_demo = true (clients can't
// set it), so a real account is never touched — review W1.
// demo@dazi-demo.invalid is the PROTECTED public demo login on the same domain: never widen
// this regex so that it matches (e.g. /^demo.*@/), or cleanup could delete it.
export const DEMO_DOMAIN = "dazi-demo.invalid";
const DEMO_EMAIL = /^(demo-\d{2}|eval-[0-9a-f]{8}|delete-test-[0-9a-f]{8})@dazi-demo\.invalid$/;
export const isDemoEmail = (email) => DEMO_EMAIL.test(email ?? "");

// Auth users that are BOTH a demo address AND flagged is_demo in their profile.
// Accounts with a demo address but no profile yet (a seed run that stopped half-way) are
// returned separately, so the seed can finish them and cleanup can remove them.
export async function listDemoUsers(admin) {
  const candidates = (await listAllUsers(admin)).filter((u) => isDemoEmail(u.email));
  if (candidates.length === 0) return { flagged: [], unflagged: [] };
  const { data, error } = await admin.from("profiles").select("id, is_demo").in("id", candidates.map((u) => u.id));
  if (error) throw error;
  const isDemo = new Map(data.map((p) => [p.id, p.is_demo]));
  return {
    flagged: candidates.filter((u) => isDemo.get(u.id) === true),
    unflagged: candidates.filter((u) => isDemo.get(u.id) !== true),
  };
}

export async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
