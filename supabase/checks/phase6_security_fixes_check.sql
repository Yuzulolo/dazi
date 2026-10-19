-- Read-only check for migration 20261019145950_security_scan_fixes.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'triggers on profiles' as check, string_agg(tgname, ', ' order by tgname) as result
  from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal
union all
select 'select policies on profiles', string_agg(policyname || ': ' || qual, ' | ')
  from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
       || ', service_role=' || has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'profiles_guard'), ('public', 'reset_demo_ai_quota'),
                                   ('public', 'save_my_match_reasons'))
union all
select 'save_my_match_reasons caps at 10 items',
       (pg_get_functiondef('public.save_my_match_reasons(jsonb, timestamptz)'::regprocedure) like '%> 10%')::text
union all
-- Existing rows the database detector would flag (expected 0 — the trigger only checks changes anyway).
select 'existing profiles with contact details (any text field)', count(*)::text
  from public.profiles p
  where private.has_contact_details(p.display_name) or private.has_contact_details(p.bio)
     or private.has_contact_details(p.home_city)
     or private.has_contact_details(array_to_string(p.hobbies, ' '))
     or private.has_contact_details(array_to_string(p.visited_cities, ' '))
union all
select 'profiles: total / onboarded', count(*) || ' / ' || count(onboarding_completed_at)
  from public.profiles;
