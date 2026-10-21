-- Phase 8 (post-submission, personal repo): speech-to-text for the plan composer.
-- Each transcription (ElevenLabs Scribe, server route app/api/speech/route.ts) takes one quota
-- slot of the new kind 'speech': 10 per user per rolling 24 h, and at most 100 'speech' calls
-- site-wide per rolling 24 h. Speech calls also count towards the existing 1,000/day site
-- ceiling for all AI calls.
--
-- 1. The kind CHECK on private.ai_calls gains 'speech'. The old CHECK is looked up in
--    pg_constraint and the migration stops unless exactly one matches.
-- 2. consume_ai_quota gains the 'speech' cap and the 100/day speech site ceiling. Everything
--    else is copied from the live definition (pg_get_functiondef, last changed in
--    20261019101105_matching_age_bands.sql): extract 20, embed 20, reason 20, profile 10,
--    1,000/day site ceiling, advisory lock, 2-day cleanup.
--
-- Who runs what:
--   - authenticated (the speech route, the existing post/match/profile code): calls
--     consume_ai_quota; it is SECURITY DEFINER, so the insert into private.ai_calls runs as the
--     function owner. Users have no direct access to private.ai_calls.
--   - anon: no EXECUTE on consume_ai_quota (unchanged).
--   - service_role: reset_demo_ai_quota() deletes every kind for the demo login (unchanged,
--     so speech slots are cleared too). ai_calls already cascades from auth.users.
--
-- Expand-only and compatible with main: main never sends 'speech'; every existing kind and
-- limit behaves exactly as before. No table, column, grant or signature changes.

-- ============ 1. the kind CHECK on private.ai_calls ============
do $$
declare
  c record;
  n int := 0;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'private.ai_calls'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table private.ai_calls drop constraint %I', c.conname);
    n := n + 1;
  end loop;
  if n <> 1 then
    raise exception 'Expected exactly one kind CHECK on private.ai_calls, found %', n;
  end if;
end;
$$;
alter table private.ai_calls
  add constraint ai_calls_kind_check check (kind in ('extract', 'embed', 'reason', 'profile', 'speech'));

-- ============ 2. consume_ai_quota: + 'speech' ============
create or replace function public.consume_ai_quota(p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid         uuid := (select auth.uid());
  used_kind   int;
  used_site   int;
  used_speech int;
  kind_cap    int;
begin
  -- Per user per rolling 24 h: 20 drafts, 20 plan saves, 20 match-reason calls, 10 profile
  -- embeddings, 10 transcriptions.
  kind_cap := case p_kind
                when 'extract' then 20
                when 'embed'   then 20
                when 'reason'  then 20
                when 'profile' then 10
                when 'speech'  then 10
              end;
  if uid is null or kind_cap is null then
    return false;
  end if;
  -- One caller at a time per user, so two parallel requests can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  delete from private.ai_calls where user_id = uid and created_at < now() - interval '2 days';
  select count(*) into used_kind from private.ai_calls
   where user_id = uid and kind = p_kind and created_at > now() - interval '24 hours';
  if used_kind >= kind_cap then
    return false;
  end if;
  -- Whole site: at most 1,000 AI calls per rolling 24 h (the key has no spending limit).
  select count(*) into used_site from private.ai_calls
   where created_at > now() - interval '24 hours';
  if used_site >= 1000 then
    return false;
  end if;
  -- Whole site: at most 100 transcriptions per rolling 24 h (ElevenLabs key).
  -- The per-user lock above doesn't serialise different users, so two users can both take
  -- the 100th slot at the same moment — at most a few over, accepted.
  if p_kind = 'speech' then
    select count(*) into used_speech from private.ai_calls
     where kind = 'speech' and created_at > now() - interval '24 hours';
    if used_speech >= 100 then
      return false;
    end if;
  end if;
  insert into private.ai_calls (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
