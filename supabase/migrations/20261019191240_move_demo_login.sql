-- Step 1 of 2: move the public demo login to a dedicated address, demo@dazi-demo.invalid
-- (.invalid can never receive mail), so the README no longer shows a variant of the owner's
-- personal email. Data only, compatible with main: the app finds the demo login through the
-- DEMO_EMAIL env var, the scripts through profiles.is_protected.
-- Run scripts/create-demo-account.mjs first. The old account stays signable-in (unflagged)
-- until Vercel's DEMO_EMAIL / DEMO_PASSWORD point at the new one; step 2 then deletes it.
do $$
declare
  new_id uuid := (select id from auth.users where email = 'demo@dazi-demo.invalid');
begin
  if new_id is null or not exists (select 1 from public.profiles where id = new_id) then
    raise exception 'Create demo@dazi-demo.invalid first (scripts/create-demo-account.mjs)';
  end if;
  update public.profiles set is_protected = false where is_protected and id <> new_id;
  update public.profiles set is_protected = true where id = new_id;
end $$;
