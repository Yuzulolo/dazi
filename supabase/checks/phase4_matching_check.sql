-- Read-only check for migration 20261018214627_matching.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'new profile columns' as check,
       string_agg(column_name || ':' || udt_name, ', ' order by column_name) as result
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name in ('profile_embedding', 'is_demo')
union all
select 'profile_embedding readable by authenticated?', has_column_privilege('authenticated', 'public.profiles', 'profile_embedding', 'select')::text
union all
select 'is_demo readable by authenticated?', has_column_privilege('authenticated', 'public.profiles', 'is_demo', 'select')::text
union all
select 'is_demo / profile_embedding updatable by authenticated?',
       has_column_privilege('authenticated', 'public.profiles', 'is_demo', 'update')::text || ' / '
       || has_column_privilege('authenticated', 'public.profiles', 'profile_embedding', 'update')::text
union all
select 'public_profiles: last column / security_invoker',
       (select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'public_profiles' order by ordinal_position desc limit 1)
       || ' / ' || (select array_to_string(reloptions, ',') from pg_class where oid = 'public.public_profiles'::regclass)
union all
select 'ai_calls kind check', pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'private.ai_calls'::regclass and contype = 'c'
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
       || ', service_role=' || has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('private', 'match_candidates'), ('public', 'match_my_post'), ('public', 'match_suggestion'),
    ('public', 'match_candidates_for_eval'), ('public', 'set_my_profile_embedding'),
    ('public', 'get_my_match_reasons'), ('public', 'save_my_match_reasons'), ('public', 'consume_ai_quota'))
union all
select 'private.match_reasons: RLS / any client grant', relrowsecurity::text || ' / '
       || (has_table_privilege('anon', 'private.match_reasons', 'select')
           or has_table_privilege('authenticated', 'private.match_reasons', 'select'))::text
  from pg_class where oid = 'private.match_reasons'::regclass
union all
select 'match_my_post columns', string_agg(a, ', ')
  from (select unnest(proargnames) as a, unnest(proargmodes) as m
          from pg_proc where oid = 'public.match_my_post()'::regprocedure) x
  where m = 't'
union all
select 'profiles: total / with profile_embedding / demo',
       count(*) || ' / ' || count(profile_embedding) || ' / ' || count(*) filter (where is_demo)
  from public.profiles;
