-- Read-only check for migration 20261016121716_profiles_onboarding_privacy.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'new columns' as check, string_agg(column_name, ', ' order by ordinal_position) as result
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('id', 'display_name', 'birth_year', 'created_at')
union all
select 'SELECT columns: authenticated', string_agg(column_name, ', ' order by column_name)
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT'
union all
select 'UPDATE columns: authenticated', string_agg(column_name, ', ' order by column_name)
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
union all
select 'table-level grants on profiles', coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'none')
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated')
union all
select 'constraint: ' || conname, 'exists'
  from pg_constraint
  where conrelid = 'public.profiles'::regclass and conname in ('profiles_pref_age_order', 'profiles_onboarding_complete')
union all
select 'view public_profiles options', array_to_string(reloptions, ', ')
  from pg_class
  where oid = 'public.public_profiles'::regclass
union all
select 'view grants', string_agg(grantee || ':' || privilege_type, ', ')
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'public_profiles' and grantee in ('anon', 'authenticated')
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'tags_ok'), ('private', 'age_range'), ('public', 'get_my_private_profile'))
union all
select 'profiles: total / onboarded', count(*) || ' / ' || count(onboarding_completed_at)
  from public.profiles;
