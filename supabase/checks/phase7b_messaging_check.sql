-- Read-only check for migration 20261020160000_messaging.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.
-- Before the migration it fails on the first row (tables don't exist yet) — run it AFTER.

with fns(name, sig) as (values
  ('private.is_blocked',               'private.is_blocked(uuid, uuid)'),
  ('private.demo_pair_ok',             'private.demo_pair_ok(uuid, uuid)'),
  ('private.invite_status',            'private.invite_status(public.invites)'),
  ('private.can_chat',                 'private.can_chat(uuid)'),
  ('public.send_invite',               'public.send_invite(uuid, text)'),
  ('public.respond_invite',            'public.respond_invite(uuid, boolean)'),
  ('public.cancel_invite',             'public.cancel_invite(uuid)'),
  ('public.send_message',              'public.send_message(uuid, text)'),
  ('public.block_from_invite',         'public.block_from_invite(uuid)'),
  ('public.my_invites',                'public.my_invites()'),
  ('public.my_pending_invite_count',   'public.my_pending_invite_count()')
)
select 'table ' || c.relname || ': RLS on (expected true)' as check,
       c.relrowsecurity::text as result
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('invites', 'messages', 'blocks')
union all
select 'table ' || t || ': anon select/insert/update/delete (expected false/false/false/false)',
       has_table_privilege('anon', 'public.' || t, 'select')::text || '/'
       || has_table_privilege('anon', 'public.' || t, 'insert')::text || '/'
       || has_table_privilege('anon', 'public.' || t, 'update')::text || '/'
       || has_table_privilege('anon', 'public.' || t, 'delete')::text
  from unnest(array['invites', 'messages', 'blocks']) as t
union all
select 'table ' || t || ': authenticated select/insert/update/delete (expected true/false/false/false)',
       has_table_privilege('authenticated', 'public.' || t, 'select')::text || '/'
       || has_table_privilege('authenticated', 'public.' || t, 'insert')::text || '/'
       || has_table_privilege('authenticated', 'public.' || t, 'update')::text || '/'
       || has_table_privilege('authenticated', 'public.' || t, 'delete')::text
  from unnest(array['invites', 'messages', 'blocks']) as t
union all
select 'policy ' || tablename || ': ' || policyname, cmd || ' to ' || array_to_string(roles, ',') || ' using ' || qual
  from pg_policies where schemaname = 'public' and tablename in ('invites', 'messages', 'blocks')
union all
select 'FK ' || src.relname || ' → ' || dst.relname || ' (expected CASCADE)',
       case c.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'r' then 'RESTRICT'
                          when 'a' then 'NO ACTION' else c.confdeltype::text end
  from pg_constraint c
  join pg_class src on src.oid = c.conrelid
  join pg_class dst on dst.oid = c.confrelid
  join pg_namespace n on n.oid = src.relnamespace
  where c.contype = 'f' and n.nspname = 'public' and src.relname in ('invites', 'messages', 'blocks')
union all
select 'function ' || f.name || ' (expected definer=true, search_path='''', anon=false)',
       'definer=' || p.prosecdef
       || ', search_path=' || coalesce(array_to_string(p.proconfig, ','), 'NOT SET')
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from fns f join pg_proc p on p.oid = f.sig::regprocedure
union all
select 'match_candidates keeps the age-band filter (expected true)',
       (pg_get_functiondef('private.match_candidates(uuid, real, real, real, integer, integer)'::regprocedure)
          like '%private.age_band(private.age_of(op.birth_year)) between me.pref_band_min and me.pref_band_max%')::text
union all
select 'match_candidates filters blocks: has is_blocked, hook comment gone (expected true)',
       (pg_get_functiondef('private.match_candidates(uuid, real, real, real, integer, integer)'::regprocedure)
          like '%and not private.is_blocked(me.uid, op.id)%'
        and pg_get_functiondef('private.match_candidates(uuid, real, real, real, integer, integer)'::regprocedure)
          not like '%PART G HOOK%')::text
union all
select 'match_candidates still invoker + not callable by clients (expected definer=false, authenticated=false)',
       'definer=' || p.prosecdef || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p where p.oid = 'private.match_candidates(uuid, real, real, real, integer, integer)'::regprocedure
union all
select 'my_invites returns only safe columns (shown) — no birth year, gender, preferences, embeddings, user ids (expected true)',
       (pg_get_function_result('public.my_invites()'::regprocedure) !~* '(birth|gender|pref_|embedding|user)')::text
       || ' — ' || pg_get_function_result('public.my_invites()'::regprocedure)
union all
select 'existing invites / messages / blocks rows',
       (select count(*) from public.invites)::text || ' / ' || (select count(*) from public.messages)::text
       || ' / ' || (select count(*) from public.blocks)::text;
