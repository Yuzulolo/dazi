-- Check for migration 20261021120000_speech_quota.sql. Paste ONE part at a time into the
-- Supabase SQL Editor and Run. Nothing here changes the database (part C rolls itself back).

-- ============ Part A — BEFORE applying: the live definitions ============
-- The migration's consume_ai_quota is copied from 20261019101105_matching_age_bands.sql.
-- Run this first and compare: it must say extract 20 / embed 20 / reason 20 / profile 10 and
-- "used_site >= 1000". kind CHECKs must be exactly one row.
select 'live consume_ai_quota' as check, pg_get_functiondef('public.consume_ai_quota(text)'::regprocedure) as result
union all
select 'kind CHECKs on private.ai_calls (expected exactly 1)',
       count(*)::text || ': ' || coalesce(string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | '), '')
  from pg_constraint
  where conrelid = 'private.ai_calls'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';

-- ============ Part B — AFTER applying: state (read-only) ============
select 'kind CHECK (expected 1 row incl. speech)' as check,
       count(*)::text || ': ' || string_agg(pg_get_constraintdef(oid), ' | ') as result
  from pg_constraint
  where conrelid = 'private.ai_calls'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
union all
select 'consume_ai_quota: definer / anon / authenticated execute (expected true / false / true)',
       p.prosecdef::text || ' / ' || has_function_privilege('anon', p.oid, 'execute')::text
       || ' / ' || has_function_privilege('authenticated', p.oid, 'execute')::text
  from pg_proc p where p.oid = 'public.consume_ai_quota(text)'::regprocedure
union all
select 'consume_ai_quota search_path pinned (expected search_path="")',
       array_to_string(p.proconfig, ', ')
  from pg_proc p where p.oid = 'public.consume_ai_quota(text)'::regprocedure
union all
select 'AI calls in the last 24 h by kind (live counters)',
       coalesce(string_agg(kind || '=' || n, ', ' order by kind), 'none')
  from (select kind, count(*) as n from private.ai_calls
         where created_at > now() - interval '24 hours' group by kind) t;

-- ============ Part C — AFTER applying: behaviour test (always rolled back) ============
-- Runs consume_ai_quota as the `authenticated` role for the protected demo login, with
-- temporary filler rows from a demo user, then raises an error ON PURPOSE so every change is
-- undone. Expected: an ERROR whose message is
--   CHECK RESULTS (rolled back): per user extract=20 embed=20 reason=20 profile=10 speech=10 |
--   speech site ceiling: at 100 refused=true (extract still allowed=true), at 99 allowed=true |
--   site ceiling: at 1000 refused=true, at 999 allowed=true | bogus kind refused=true
do $$
declare
  me     uuid := (select id from public.profiles where is_protected limit 1);
  filler uuid := (select id from public.profiles where is_demo and not is_protected limit 1);
  r      text := 'per user';
  k      text;
  n      int;
  missing int;
begin
  if me is null or filler is null then
    raise exception 'Need the protected demo login and at least one demo user';
  end if;
  -- Precondition: live traffic must leave room for the test (else the numbers would lie).
  if (select count(*) from private.ai_calls where user_id <> me and created_at > now() - interval '24 hours') > 800
     or (select count(*) from private.ai_calls where user_id <> me and kind = 'speech' and created_at > now() - interval '24 hours') > 80 then
    raise exception 'Live AI traffic is too high for a fair test right now — run part C later';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

  -- 1. Per-user caps: count how many calls succeed per kind (stops at 30 so a bug can't loop).
  delete from private.ai_calls where user_id = me;
  execute 'set local role authenticated';
  foreach k in array array['extract', 'embed', 'reason', 'profile', 'speech'] loop
    n := 0;
    while n < 30 and public.consume_ai_quota(k) loop
      n := n + 1;
    end loop;
    r := r || ' ' || k || '=' || n;
  end loop;
  execute 'reset role';

  -- 2. Speech site ceiling: fill the site up to exactly 100 speech calls (from the filler user).
  delete from private.ai_calls where user_id = me;
  select 100 - count(*) into missing from private.ai_calls
   where kind = 'speech' and created_at > now() - interval '24 hours';
  insert into private.ai_calls (user_id, kind) select filler, 'speech' from generate_series(1, missing);
  execute 'set local role authenticated';
  r := r || ' | speech site ceiling: at 100 refused=' || (not public.consume_ai_quota('speech'))::text;
  -- Control: the refusal comes from the speech cap, not the 1,000 ceiling.
  r := r || ' (extract still allowed=' || public.consume_ai_quota('extract')::text || ')';
  execute 'reset role';
  delete from private.ai_calls where user_id = me;
  delete from private.ai_calls
   where id = (select max(id) from private.ai_calls where user_id = filler and kind = 'speech');
  execute 'set local role authenticated';
  r := r || ', at 99 allowed=' || public.consume_ai_quota('speech')::text;
  execute 'reset role';

  -- 3. Site ceiling for all kinds: fill the site up to exactly 1,000 calls.
  delete from private.ai_calls where user_id = me;
  delete from private.ai_calls where user_id = filler and kind = 'speech';
  select 1000 - count(*) into missing from private.ai_calls where created_at > now() - interval '24 hours';
  insert into private.ai_calls (user_id, kind) select filler, 'reason' from generate_series(1, missing);
  execute 'set local role authenticated';
  r := r || ' | site ceiling: at 1000 refused=' || (not public.consume_ai_quota('extract'))::text;
  execute 'reset role';
  delete from private.ai_calls
   where id = (select max(id) from private.ai_calls where user_id = filler and kind = 'reason');
  execute 'set local role authenticated';
  r := r || ', at 999 allowed=' || public.consume_ai_quota('extract')::text;
  r := r || ' | bogus kind refused=' || (not public.consume_ai_quota('free_money'))::text;
  execute 'reset role';

  raise exception 'CHECK RESULTS (rolled back): %', r;
end;
$$;
