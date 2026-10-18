-- Phase 3 / part C hardening (PR #5 review C1 + S1).
-- 1. Users can no longer INSERT/UPDATE posts directly. The only write paths are
--    public.publish_post() and public.update_post(): security definer, pinned to auth.uid().
-- 2. The database itself enforces (trigger, so every path incl. those functions):
--    no phone numbers / emails in text fields, no past start date for new posts,
--    no moving an edited start date earlier, only active → closed / archived status changes.
-- 3. AI quota: separate per-user budgets (20 drafts + 20 saves per 24 h) and a
--    site-wide ceiling of 1,000 AI calls per 24 h.
-- 4. Consistency: private.set_updated_at() is not callable by client roles.
--
-- Compatible with main: main has no posts code; only phase-3 code uses these objects.
-- Known, documented gap: a user calling publish_post/update_post directly can send an
-- embedding that does not match their text; the impact is limited to their own ranking.

-- ============ 4. trigger-only function: not callable by clients ============
revoke execute on function private.set_updated_at() from public, anon, authenticated;

-- ============ 1. no direct writes ============
-- Revoking the table privilege also removes the column-level INSERT/UPDATE grants.
-- Kept: SELECT on every column except embedding, and DELETE (own rows, RLS).
revoke insert, update on public.posts from authenticated;
drop policy if exists "posts: onboarded owner creates" on public.posts;
drop policy if exists "posts: owner updates" on public.posts;

-- ============ 2. database-level content rules ============
-- Same idea as lib/profile/contact.ts: an email, or a run of 9+ digits joined by
-- spaces, dots, dashes or brackets (not slashes, so "2018/2019/2020" is fine).
create or replace function private.has_contact_details(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(t, '') ~ '[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+'
      or exists (
           select 1
           from regexp_matches(coalesce(t, ''), '\+?[0-9][0-9[:space:]().-]{6,}[0-9]', 'g') as m(parts)
           where length(regexp_replace(m.parts[1], '[^0-9]', '', 'g')) >= 9
         );
$$;
revoke execute on function private.has_contact_details(text) from public, anon, authenticated;

create or replace function private.posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if private.has_contact_details(new.raw_text)
     or private.has_contact_details(new.city)
     or private.has_contact_details(new.vibe)
     or private.has_contact_details(array_to_string(new.headline, ' ')) then
    raise exception 'Contact details are not allowed in posts' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'active' then
      raise exception 'New posts must be active' using errcode = 'check_violation';
    end if;
    if new.start_date < today then
      raise exception 'A new post cannot start in the past' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.user_id <> old.user_id then
    raise exception 'A post cannot change owner' using errcode = 'check_violation';
  end if;
  if new.status <> old.status and not (old.status = 'active' and new.status in ('closed', 'archived')) then
    raise exception 'Invalid post status change: % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    if new.end_date < today then
      raise exception 'This trip has already ended' using errcode = 'check_violation';
    end if;
    if new.start_date < least(old.start_date, today) then
      raise exception 'The start date cannot move further into the past' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.posts_guard() from public, anon, authenticated;

create trigger posts_guard
  before insert or update on public.posts
  for each row execute function private.posts_guard();

-- ============ write path 1: publish (archive the old active post + insert, one transaction) ============
-- Now security definer (RLS is bypassed inside), so it checks the caller itself:
-- signed in, onboarded, and every row it touches belongs to auth.uid().
create or replace function public.publish_post(
  p_raw_text text, p_city text, p_start_date date, p_end_date date, p_interests text[],
  p_budget text, p_vibe text, p_headline text[], p_tone text, p_ai_assisted boolean,
  p_embedding text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  new_id uuid;
begin
  if uid is null or not private.is_onboarded() then
    raise exception 'Only signed-in, onboarded users can post' using errcode = 'insufficient_privilege';
  end if;

  update public.posts set status = 'archived'
   where user_id = uid and status = 'active';

  insert into public.posts (user_id, raw_text, city, start_date, end_date, interests, budget,
                            vibe, headline, tone, ai_assisted, embedding)
  values (uid, p_raw_text, p_city, p_start_date, p_end_date, p_interests, p_budget,
          p_vibe, p_headline, p_tone, coalesce(p_ai_assisted, false), p_embedding::extensions.vector)
  returning id into new_id;

  return new_id;
end;
$$;
revoke execute on function public.publish_post(text, text, date, date, text[], text, text, text[], text, boolean, text) from public, anon;
grant execute on function public.publish_post(text, text, date, date, text[], text, text, text[], text, boolean, text) to authenticated;

-- ============ write path 2: edit the caller's active post ============
-- p_embedding null = keep the stored embedding (nothing it is built from changed).
-- Raises if the caller has no active post, so the app never reports a silent no-op.
create or replace function public.update_post(
  p_raw_text text, p_city text, p_start_date date, p_end_date date, p_interests text[],
  p_budget text, p_vibe text, p_headline text[], p_tone text, p_embedding text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := (select auth.uid());
  updated_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  update public.posts
     set raw_text   = p_raw_text,
         city       = p_city,
         start_date = p_start_date,
         end_date   = p_end_date,
         interests  = p_interests,
         budget     = p_budget,
         vibe       = p_vibe,
         headline   = p_headline,
         tone       = p_tone,
         embedding  = coalesce(p_embedding::extensions.vector, embedding)
   where user_id = uid and status = 'active'
   returning id into updated_id;

  if updated_id is null then
    raise exception 'No active post to update' using errcode = 'no_data_found';
  end if;
  return updated_id;
end;
$$;
revoke execute on function public.update_post(text, text, date, date, text[], text, text, text[], text, text) from public, anon;
grant execute on function public.update_post(text, text, date, date, text[], text, text, text[], text, text) to authenticated;

-- ============ 3. AI quota: per-kind budgets + site-wide ceiling ============
create index if not exists ai_calls_time on private.ai_calls (created_at);

create or replace function public.consume_ai_quota(p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid       uuid := (select auth.uid());
  used_kind int;
  used_site int;
begin
  if uid is null or p_kind not in ('extract', 'embed') then
    return false;
  end if;
  -- One caller at a time per user, so two parallel requests can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  delete from private.ai_calls where user_id = uid and created_at < now() - interval '2 days';

  -- Per user: 20 AI drafts and 20 saves (embeddings) per rolling 24 h.
  select count(*) into used_kind from private.ai_calls
   where user_id = uid and kind = p_kind and created_at > now() - interval '24 hours';
  if used_kind >= 20 then
    return false;
  end if;

  -- Whole site: at most 1,000 AI calls per rolling 24 h (the key has no spending limit).
  select count(*) into used_site from private.ai_calls
   where created_at > now() - interval '24 hours';
  if used_site >= 1000 then
    return false;
  end if;

  insert into private.ai_calls (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
