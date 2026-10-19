-- Read-only check for 20261019191240_move_demo_login.sql (and, later, ..._delete_old_demo_login.sql).
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'protected accounts (expected 1)' as check, count(*)::text as result
  from public.profiles where is_protected
union all
select 'protected account email (expected demo@dazi-demo.invalid)', string_agg(u.email, ', ')
  from public.profiles p join auth.users u on u.id = p.id where p.is_protected
union all
select 'protected account onboarded (expected true after the reset script)',
       bool_and(p.onboarding_completed_at is not null)::text
  from public.profiles p where p.is_protected
union all
select 'protected account plans (expected 1 after the reset script)', count(*)::text
  from public.posts po join public.profiles p on p.id = po.user_id where p.is_protected
union all
select 'former demo login still exists (true until step 2, then false)',
       exists (select 1 from auth.users where id = 'd7093bc6-e2b4-4e4e-8b3e-654e35566b49')::text;
