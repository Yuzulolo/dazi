-- Read-only check for migration 20261020170000_messaging_review_fixes.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.
-- Before the migration the first three rows are false; after it every row matches "expected".

select 'send_invite locks the user pair (M3, expected true)' as check,
       (pg_get_functiondef('public.send_invite(uuid, text)'::regprocedure) like '%invite-pair:%')::text as result
union all
select 'send_invite checks "already connected" in both directions (M2, expected true)',
       (pg_get_functiondef('public.send_invite(uuid, text)'::regprocedure)
          like '%i.from_post = p_to_post and i.to_post = my_post%')::text
union all
select 'send_message refuses contact details in the shared demo chat (M1, expected true)',
       (pg_get_functiondef('public.send_message(uuid, text)'::regprocedure) like '%shared demo chat%')::text
union all
select 'my_invites hides cancelled invites from the receiver (S7, expected true)',
       (pg_get_functiondef('public.my_invites()'::regprocedure) like '%i.status = ''cancelled''%')::text
union all
select 'my_invites still returns only safe columns (expected true)',
       (pg_get_function_result('public.my_invites()'::regprocedure) !~* '(birth|gender|pref_|embedding|user)')::text
union all
select 'function ' || p.proname || ' (expected definer=true, search_path set, anon=false, authenticated=true)',
       'definer=' || p.prosecdef || ', ' || coalesce(array_to_string(p.proconfig, ','), 'search_path NOT SET')
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
  where p.oid in ('public.send_invite(uuid, text)'::regprocedure, 'public.send_message(uuid, text)'::regprocedure,
                  'public.my_invites()'::regprocedure);
