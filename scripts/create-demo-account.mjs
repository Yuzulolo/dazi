// Creates the dedicated public demo login (DEMO_EMAIL / DEMO_PASSWORD from .env.local).
// LOCAL ONLY — uses the service role key. Idempotent: does nothing if the account exists.
//
//   node --env-file=.env.local scripts/create-demo-account.mjs
//
// Then apply the migration that moves profiles.is_protected to this account, and run
// scripts/reset-demo-account.mjs to onboard it with a Berlin plan.
import { adminClient, listAllUsers } from "./lib/admin.mjs";

const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!email || !password) {
  console.error("Missing DEMO_EMAIL or DEMO_PASSWORD in .env.local");
  process.exit(1);
}

const admin = adminClient();
const existing = (await listAllUsers(admin)).find((u) => u.email === email);
if (existing) {
  if (!existing.email_confirmed_at) console.warn(`warn ${email} exists but its email is not confirmed`);
  const { data: profile } = await admin.from("profiles").select("id").eq("id", existing.id).maybeSingle();
  if (!profile) console.warn(`warn ${email} exists but has no profile row — the move migration will refuse it`);
  console.log(`ok  ${email} already exists (${existing.id}) — nothing changed`);
  process.exit(0);
}

// The sign-up trigger needs display_name and birth_year (18+) in the user metadata.
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "Demo", birth_year: 1990 },
});
if (error) throw new Error(`create user: ${error.message}`);
console.log(`ok  created ${email} (${data.user.id}), email confirmed`);
