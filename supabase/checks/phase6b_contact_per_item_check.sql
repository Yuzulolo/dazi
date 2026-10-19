-- Read-only check for migration 20261019155453_contact_check_per_item.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'per-item: ["Chess Elo 1850", "10000 steps"] flagged? (expected false)' as check,
       private.any_contact_details(array['Chess Elo 1850', '10000 steps'])::text as result
union all
select 'joined text (the OLD behaviour) flagged? (expected true — shows the bug)',
       private.has_contact_details(array_to_string(array['Chess Elo 1850', '10000 steps'], ' '))::text
union all
select 'per-item: ["vinyl", "call 0151 23456789"] flagged? (expected true)',
       private.any_contact_details(array['vinyl', 'call 0151 23456789'])::text
union all
select 'per-item: empty / null list flagged? (expected false / false)',
       private.any_contact_details('{}'::text[])::text || ' / ' || private.any_contact_details(null)::text
union all
select 'profiles_guard uses per-item check',
       (pg_get_functiondef('private.profiles_guard()'::regprocedure) like '%any_contact_details(new.hobbies)%'
        and pg_get_functiondef('private.profiles_guard()'::regprocedure) like '%any_contact_details(new.visited_cities)%')::text
union all
select 'posts_guard uses per-line headline check',
       (pg_get_functiondef('private.posts_guard()'::regprocedure) like '%any_contact_details(new.headline)%')::text
union all
select 'save_my_match_reasons skips items without post_id',
       (pg_get_functiondef('public.save_my_match_reasons(jsonb, timestamptz)'::regprocedure) like '%post_id'') is null%')::text
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
       || ', service_role=' || has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'any_contact_details'), ('private', 'profiles_guard'),
                                   ('private', 'posts_guard'), ('public', 'save_my_match_reasons'));
