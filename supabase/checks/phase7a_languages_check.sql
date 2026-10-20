-- Read-only check for migration 20261020143000_languages_custom.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.
-- Before the migration: rows 1–2 show the OLD fixed-list check and guard=false.
-- After: every "expected" matches.

select 'CHECK constraints on profiles mentioning languages' as check,
       string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ' order by conname) as result
  from pg_constraint
  where conrelid = 'public.profiles'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%languages%'
union all
select 'profiles_guard checks languages (expected true)',
       (pg_get_functiondef('private.profiles_guard()'::regprocedure)
          like '%any_contact_details(new.languages)%')::text
union all
select 'profiles_guard still checks hobbies + cities (expected true)',
       (pg_get_functiondef('private.profiles_guard()'::regprocedure) like '%any_contact_details(new.hobbies)%'
        and pg_get_functiondef('private.profiles_guard()'::regprocedure) like '%any_contact_details(new.visited_cities)%')::text
union all
select 'profiles_guard: definer / anon / authenticated execute (expected true / false / false)',
       p.prosecdef::text || ' / ' || has_function_privilege('anon', p.oid, 'execute')::text
       || ' / ' || has_function_privilege('authenticated', p.oid, 'execute')::text
  from pg_proc p where p.oid = 'private.profiles_guard()'::regprocedure
union all
select 'tags_ok: [''Swahili''] / 31 chars / 11 items (expected true / false / false)',
       private.tags_ok(array['Swahili'], 10, 30)::text || ' / '
       || private.tags_ok(array[repeat('a', 31)], 10, 30)::text || ' / '
       || private.tags_ok(array_fill('en'::text, array[11]), 10, 30)::text
union all
select 'contact detector on [''English'', ''me@example.com''] (expected true)',
       private.any_contact_details(array['English', 'me@example.com'])::text
union all
select 'existing profiles that would break the new check (expected 0)',
       count(*)::text from public.profiles where not private.tags_ok(languages, 10, 30)
union all
select 'distinct language values in use',
       string_agg(distinct l, ', ' order by l) from public.profiles, unnest(languages) as l;
