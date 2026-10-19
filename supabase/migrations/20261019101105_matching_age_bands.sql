-- PR #6 review fixes (part D): C1, W3, S3, S6.
-- C1  Matching compares AGE BANDS, not exact ages: a preference is widened to whole bands, so
--     setting "31–31" means "30–34" and filtering can never reveal more than the band people see.
-- W3  Profile embeddings get their own AI budget (kind 'profile', 10 per user / 24 h), so profile
--     edits can no longer use up the 20 plan saves.
-- S3  A cached match reason is invalid once the other person's PROFILE changed too (new
--     profiles.updated_at), and it is stamped with the time generation STARTED (no race).
-- S6  Ages everywhere use the Berlin calendar year (was: UTC year in age_range).
--
-- Expand-only, compatible with main: profiles gains a column with a default, functions keep
-- their signatures except save_my_match_reasons (only called by phase-4 code, not on main).

-- ============ S6 + C1: one definition of "age" and "age band" ============
create or replace function private.age_of(p_birth_year int)
returns int
language sql
stable
set search_path = ''
as $$
  select extract(year from (now() at time zone 'Europe/Berlin'))::int - p_birth_year;
$$;

-- Bands = the ranges people are shown: 0 = 18–24, 1 = 25–29, 2 = 30–34, 3 = 35–39,
-- 4 = 40–49, 5 = 50–59, 6 = 60+.
create or replace function private.age_band(p_age int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
           when p_age is null then null
           when p_age < 25 then 0
           when p_age < 30 then 1
           when p_age < 35 then 2
           when p_age < 40 then 3
           when p_age < 50 then 4
           when p_age < 60 then 5
           else 6
         end;
$$;

-- age_range now uses the same age (Berlin year) and the same bands.
create or replace function private.age_range(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select (array['18–24', '25–29', '30–34', '35–39', '40–49', '50–59', '60+'])
           [private.age_band(private.age_of(p.birth_year)) + 1]
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke execute on function private.age_of(int) from public, anon, authenticated;
revoke execute on function private.age_band(int) from public, anon, authenticated;
grant execute on function private.age_of(int) to service_role;
grant execute on function private.age_band(int) to service_role;

-- ============ S3: profiles.updated_at ============
alter table public.profiles add column updated_at timestamptz not null default now();
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ============ C1: band matching inside the matching core ============
-- Same as 20261018214627 except the MUTUAL age filter: the candidate's band must lie within the
-- bands of the viewer's preference (and vice versa). Age uses private.age_of (Berlin year).
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
           pr.id as uid, pr.languages, pr.gender, pr.pref_gender,
           private.age_band(private.age_of(pr.birth_year)) as band,
           private.age_band(pr.pref_age_min) as pref_band_min,
           private.age_band(pr.pref_age_max) as pref_band_max,
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
      greatest(0, 1 - (o.embedding operator(extensions.<=>) me.embedding)) as trip,
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
      -- MUTUAL age preference, compared in whole bands (review C1): a preference of "31–31"
      -- means band 30–34, so filtering never reveals more than the age range people see.
      and private.age_band(private.age_of(op.birth_year)) between me.pref_band_min and me.pref_band_max
      and me.band between private.age_band(op.pref_age_min) and private.age_band(op.pref_age_max)
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

-- ============ W3: separate budget for profile embeddings ============
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
  add constraint ai_calls_kind_check check (kind in ('extract', 'embed', 'reason', 'profile'));

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
  kind_cap  int;
begin
  -- Per user per rolling 24 h: 20 drafts, 20 plan saves, 20 match-reason calls, 10 profile embeddings.
  kind_cap := case p_kind
                when 'extract' then 20
                when 'embed'   then 20
                when 'reason'  then 20
                when 'profile' then 10
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
  insert into private.ai_calls (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- ============ S3: reasons invalid after the other person's profile changes; no race ============
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
  join public.profiles their_profile on their_profile.id = theirs.user_id
  where mine.user_id = (select auth.uid())
    and mine.status = 'active'
    and r.candidate_post_id = any (p_candidate_post_ids)
    and r.created_at >= greatest(mine.updated_at, theirs.updated_at, their_profile.updated_at);
$$;

-- p_generated_at = when the app STARTED generating: if either post or the other person's
-- profile changed during generation, the stored reason is already older than that change.
drop function if exists public.save_my_match_reasons(jsonb);
create or replace function public.save_my_match_reasons(p_reasons jsonb, p_generated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_post uuid;
  item    jsonb;
  stamp   timestamptz := least(now(), greatest(coalesce(p_generated_at, now()), now() - interval '10 minutes'));
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
    insert into private.match_reasons (viewer_post_id, candidate_post_id, reason, created_at)
    values (my_post, (item->>'post_id')::uuid, left(item->>'reason', 200), stamp)
    on conflict (viewer_post_id, candidate_post_id)
    do update set reason = excluded.reason, created_at = excluded.created_at;
  end loop;
end;
$$;
revoke execute on function public.save_my_match_reasons(jsonb, timestamptz) from public, anon;
grant execute on function public.save_my_match_reasons(jsonb, timestamptz) to authenticated;
