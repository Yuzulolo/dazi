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

// Demo accounts live on reserved domains that can never receive mail.
export const DEMO_DOMAINS = ["dazi-demo.invalid", "example.com"];
export const isDemoEmail = (email) => DEMO_DOMAINS.some((d) => (email ?? "").endsWith(`@${d}`));

export async function listAllUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
