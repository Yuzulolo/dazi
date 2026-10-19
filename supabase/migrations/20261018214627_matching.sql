-- Phase 4 / part D: personality embeddings, matching, cached AI reasons, demo users.
-- See docs/SPEC.md §0.2 D, §5 and docs/FLOWS.md 2.0b.
-- Expand-only: nothing on main reads or writes these objects; public_profiles only gains
-- a column at the end.
--
-- Privacy: other users' posts are ONLY returned by public.match_my_post() (security definer,
-- pinned to auth.uid()), which applies every hard filter and returns only safe fields.
-- profile_embedding is readable by nobody through the API.

-- ============ profiles: personality embedding + demo flag ============
alter table public.profiles
  add column profile_embedding extensions.vector(1536),       -- bio + hobbies + cities + interests
  add column is_demo boolean not null default false;          -- seeded demo users (badge in the UI)

-- Signed-in users may see is_demo (public, like display_name); never profile_embedding.
-- Neither column is updatable by clients (no UPDATE grant).
grant select (is_demo) on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = true) as
select p.id,
       p.display_name,
       private.age_range(p.id) as age_range,
       p.languages,
       p.home_city,
       p.bio,
       p.visited_cities,
       p.hobbies,
       p.travel_pace,
       p.day_rhythm,
       p.travel_interests,
       p.is_demo
from public.profiles p
where p.onboarding_completed_at is not null;

-- The caller stores their own personality embedding (server action after a quota slot).
-- Same documented gap as posts: a direct caller could send a mismatched vector (own ranking only).
create or replace function public.set_my_profile_embedding(p_embedding text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
     set profile_embedding = p_embedding::extensions.vector
   where id = (select auth.uid());
end;
$$;
revoke execute on function public.set_my_profile_embedding(text) from public, anon;
grant execute on function public.set_my_profile_embedding(text) to authenticated;

-- ============ AI quota: new kind "reason" (20 per user / 24 h, inside the 1,000 site ceiling) ============
-- Drop the existing kind CHECK whatever its generated name is, then add the wider one.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'private.ai_calls'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table private.ai_calls drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table private.ai_calls
  add constraint ai_calls_kind_check check (kind in ('extract', 'embed', 'reason'));

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
  if uid is null or p_kind not in ('extract', 'embed', 'reason') then
    return false;
  end if;
  -- One caller at a time per user, so two parallel requests can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  delete from private.ai_calls where user_id = uid and created_at < now() - interval '2 days';
  -- Per user: 20 per kind (drafts / saves / match reasons) per rolling 24 h.
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

-- ============ the matching core (private: only callable through the wrappers below) ============
-- Score = w_trip × trip + w_style × style + w_personality × personality   (SPEC §5)
--   trip        = cosine similarity of the two post embeddings
--   style       = average of pace (1 − |a−b|/4), interests Jaccard, day rhythm (same 1 / one flexible 0.5 / else 0)
--   personality = cosine similarity of the two profile embeddings (0 if either is missing)
-- p_extra_days widens the date overlap (used only for the "±3 days → n people" suggestion).
create or replace function private.match_candidates(
  p_user uuid,
  w_trip real, w_style real, w_personality real,
  p_extra_days int default 0,
  p_limit int default 10)
returns table (
  post_id uuid, headline text[], tone text, city text,
  overlap_start date, overlap_end date, interests text[],
  display_name text, age_range text, languages text[], is_demo boolean,
  travel_pace smallint, day_rhythm text, shared_interests text[],
  trip_score real, style_score real, personality_score real, total_score real)
language sql
stable
set search_path = ''
as $$
  with params as (
    select (now() at time zone 'Europe/Berlin')::date as today
  ),
  me as (
    select po.id, po.city, po.start_date, po.end_date, po.embedding, po.interests,
           pr.id as uid, pr.languages, pr.gender, pr.pref_gender, pr.pref_age_min, pr.pref_age_max,
           extract(year from params.today)::int - pr.birth_year as age,
           pr.travel_pace, pr.day_rhythm, pr.travel_interests, pr.profile_embedding
    from public.posts po
    join public.profiles pr on pr.id = po.user_id
    cross join params
    where po.user_id = p_user
      and po.status = 'active'
      and po.end_date >= params.today
      and pr.onboarding_completed_at is not null
  ),
  scored as (
    select
      o.id as post_id, o.headline, o.tone, o.city,
      greatest(o.start_date, me.start_date) as overlap_start,
      least(o.end_date, me.end_date) as overlap_end,
      o.interests, op.display_name, private.age_range(op.id) as age_range, op.languages, op.is_demo,
      op.travel_pace, op.day_rhythm,
      array(select unnest(o.interests || op.travel_interests)
            intersect
            select unnest(me.interests || me.travel_interests)) as shared_interests,
      -- trip: cosine similarity of the post embeddings (<=> is cosine distance)
      greatest(0, 1 - (o.embedding operator(extensions.<=>) me.embedding)) as trip,
      -- style: pace + interests Jaccard + day rhythm, averaged
      ( (1 - abs(op.travel_pace - me.travel_pace) / 4.0)
      + coalesce(
          cardinality(array(select unnest(op.travel_interests) intersect select unnest(me.travel_interests)))::numeric
          / nullif(cardinality(array(select unnest(op.travel_interests) union select unnest(me.travel_interests))), 0),
          0)
      + case
          when op.day_rhythm = me.day_rhythm then 1
          when 'flexible' in (op.day_rhythm, me.day_rhythm) then 0.5
          else 0
        end
      ) / 3.0 as style,
      -- personality: cosine similarity of the profile embeddings (0 if either is missing)
      coalesce(greatest(0, 1 - (op.profile_embedding operator(extensions.<=>) me.profile_embedding)), 0) as personality
    from me
    cross join params
    join public.posts o
      on o.status = 'active'
     and o.user_id <> me.uid                                         -- not yourself
     and o.end_date >= params.today                                  -- ended trips don't count
     and lower(o.city) = lower(me.city)                              -- same city
     and o.start_date <= me.end_date + p_extra_days                  -- overlapping dates
     and o.end_date >= me.start_date - p_extra_days
    join public.profiles op
      on op.id = o.user_id
     and op.onboarding_completed_at is not null                      -- onboarded
    where op.languages && me.languages                               -- >= 1 shared language
      -- MUTUAL age preference
      and extract(year from params.today)::int - op.birth_year between me.pref_age_min and me.pref_age_max
      and me.age between op.pref_age_min and op.pref_age_max
      -- MUTUAL gender preference. pref null = anyone. A user with a preference only sees people
      -- whose gender matches it, so people without a gender (or with "other", which can't be
      -- chosen as a preference) are only visible to users without a preference.
      and (me.pref_gender is null or op.gender = me.pref_gender)
      and (op.pref_gender is null or me.gender = op.pref_gender)
      -- PART G HOOK (blocks): add  and not private.is_blocked(me.uid, op.id)  here.
  )
  select post_id, headline, tone, city, overlap_start, overlap_end, interests,
         display_name, age_range, languages, is_demo, travel_pace, day_rhythm, shared_interests,
         trip::real, style::real, personality::real,
         (w_trip * trip + w_style * style + w_personality * personality)::real as total_score
  from scored
  order by total_score desc, post_id
  limit p_limit;
$$;
revoke execute on function private.match_candidates(uuid, real, real, real, int, int) from public, anon, authenticated;

-- ============ what the app calls ============
-- Top 10 for the caller's active post (empty if they have none). Weights from SPEC §5.
create or replace function public.match_my_post()
returns table (
  post_id uuid, headline text[], tone text, city text,
  overlap_start date, overlap_end date, interests text[],
  display_name text, age_range text, languages text[], is_demo boolean,
  travel_pace smallint, day_rhythm text, shared_interests text[],
  trip_score real, style_score real, personality_score real, total_score real)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.match_candidates((select auth.uid()), 0.4, 0.35, 0.25, 0, 10);
$$;

-- "No buddies yet" suggestion: how many people would match with ±3 / ±7 days. Counts only, no AI.
create or replace function public.match_suggestion()
returns table (extra_days int, matches int)
language sql
stable
security definer
set search_path = ''
as $$
  select d, (select count(*)::int
             from private.match_candidates((select auth.uid()), 0.4, 0.35, 0.25, d, 1000))
  from unnest(array[3, 7]) as d;
$$;

-- Evaluation only (local script with the service role key): any user, any weights.
create or replace function public.match_candidates_for_eval(
  p_user uuid, w_trip real, w_style real, w_personality real, p_limit int default 10)
returns table (
  post_id uuid, headline text[], tone text, city text,
  overlap_start date, overlap_end date, interests text[],
  display_name text, age_range text, languages text[], is_demo boolean,
  travel_pace smallint, day_rhythm text, shared_interests text[],
  trip_score real, style_score real, personality_score real, total_score real)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.match_candidates(p_user, w_trip, w_style, w_personality, 0, p_limit);
$$;

revoke execute on function public.match_my_post() from public, anon;
grant execute on function public.match_my_post() to authenticated;
revoke execute on function public.match_suggestion() from public, anon;
grant execute on function public.match_suggestion() to authenticated;
revoke execute on function public.match_candidates_for_eval(uuid, real, real, real, int) from public, anon, authenticated;
grant execute on function public.match_candidates_for_eval(uuid, real, real, real, int) to service_role;

-- ============ cached AI match reasons (per ordered pair of posts) ============
-- A cached reason is valid while neither post changed after it was written.
create table private.match_reasons (
  viewer_post_id    uuid not null references public.posts (id) on delete cascade,
  candidate_post_id uuid not null references public.posts (id) on delete cascade,
  reason            text not null check (char_length(reason) between 1 and 200),
  created_at        timestamptz not null default now(),
  primary key (viewer_post_id, candidate_post_id)
);
create index match_reasons_candidate on private.match_reasons (candidate_post_id);  -- FK cascade lookups
alter table private.match_reasons enable row level security;   -- no policies: functions only
revoke all on private.match_reasons from public, anon, authenticated;

-- Cached reasons for the caller's active post vs the given candidate posts.
create or replace function public.get_my_match_reasons(p_candidate_post_ids uuid[])
returns table (candidate_post_id uuid, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.candidate_post_id, r.reason
  from private.match_reasons r
  join public.posts mine on mine.id = r.viewer_post_id
  join public.posts theirs on theirs.id = r.candidate_post_id
  where mine.user_id = (select auth.uid())
    and mine.status = 'active'
    and r.candidate_post_id = any (p_candidate_post_ids)
    and r.created_at >= greatest(mine.updated_at, theirs.updated_at);
$$;

-- Store reasons for the caller's active post. Only for candidates that are in the caller's
-- current matches (so nobody can attach text to arbitrary posts); contact details refused.
create or replace function public.save_my_match_reasons(p_reasons jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_post uuid;
  item    jsonb;
begin
  select id into my_post from public.posts where user_id = (select auth.uid()) and status = 'active';
  if my_post is null then
    raise exception 'No active post' using errcode = 'no_data_found';
  end if;
  for item in select * from jsonb_array_elements(p_reasons) loop
    if not exists (select 1 from public.match_my_post() m where m.post_id = (item->>'post_id')::uuid) then
      continue;  -- not one of the caller's current matches
    end if;
    if coalesce(item->>'reason', '') = '' or private.has_contact_details(item->>'reason') then
      continue;
    end if;
    insert into private.match_reasons (viewer_post_id, candidate_post_id, reason)
    values (my_post, (item->>'post_id')::uuid, left(item->>'reason', 200))
    on conflict (viewer_post_id, candidate_post_id)
    do update set reason = excluded.reason, created_at = now();
  end loop;
end;
$$;
revoke execute on function public.get_my_match_reasons(uuid[]) from public, anon;
grant execute on function public.get_my_match_reasons(uuid[]) to authenticated;
revoke execute on function public.save_my_match_reasons(jsonb) from public, anon;
grant execute on function public.save_my_match_reasons(jsonb) to authenticated;
