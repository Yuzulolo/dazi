-- Step 2 of 2 — apply only AFTER Vercel's DEMO_EMAIL / DEMO_PASSWORD point at
-- demo@dazi-demo.invalid and production was redeployed (otherwise "Try the demo account"
-- on the live site would sign in to a deleted account).
-- Deletes the former demo login by id (no email in the repo). Every user table cascades from
-- auth.users (phase 5 check), so its profile, plans, cached reasons and AI counters go too.
-- Guarded: never deletes a protected or seeded demo account, and does nothing if already gone.
delete from auth.users u
 where u.id = 'd7093bc6-e2b4-4e4e-8b3e-654e35566b49'
   and not exists (select 1 from public.profiles p where p.id = u.id and (p.is_protected or p.is_demo));
