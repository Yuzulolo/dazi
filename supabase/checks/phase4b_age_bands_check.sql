-- Read-only check for migration 20261019101105_matching_age_bands.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'age_band(31) / (24) / (25) / (49) / (60)' as check,
       private.age_band(31) || ' / ' || private.age_band(24) || ' / ' || private.age_band(25)
       || ' / ' || private.age_band(49) || ' / ' || private.age_band(60) as result
union all
select 'a "31–31" preference covers bands', private.age_band(31) || '..' || private.age_band(31)
       || ' = ages 30–34 (age 29 → band ' || private.age_band(29) || ', age 35 → band ' || private.age_band(35) || ')'
union all
select 'age_of uses the Berlin year', (private.age_of(2000) = extract(year from (now() at time zone 'Europe/Berlin'))::int - 2000)::text
union all
select 'profiles.updated_at', coalesce((select udt_name || ', not null=' || (is_nullable = 'NO')
         from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'), 'MISSING')
union all
select 'triggers on profiles', string_agg(tgname, ', ' order by tgname)
  from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal
union all
select 'ai_calls kind check', pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'private.ai_calls'::regclass and contype = 'c'
union all
select 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'age_of'), ('private', 'age_band'), ('private', 'age_range'),
                                   ('public', 'save_my_match_reasons'), ('public', 'get_my_match_reasons'),
                                   ('public', 'consume_ai_quota'), ('private', 'match_candidates'))
union all
select 'match_candidates uses age bands', (pg_get_functiondef('private.match_candidates(uuid, real, real, real, int, int)'::regprocedure) like '%age_band%')::text
union all
select 'profiles: total / demo', count(*) || ' / ' || count(*) filter (where is_demo)
  from public.profiles;
