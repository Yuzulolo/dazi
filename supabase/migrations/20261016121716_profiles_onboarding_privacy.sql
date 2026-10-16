-- Phase 2 / part B: onboarding fields + privacy of birth year, gender and preferences.
-- See docs/SPEC.md §0.2 B, §4.3 and docs/FLOWS.md 2.0 / 2.0b.

-- ============ private helper schema (NOT exposed through the Data API) ============
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- True when the array has at most max_items elements, each 1..max_len chars after trimming.
create or replace function private.tags_ok(arr text[], max_items int, max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(arr), 0) <= max_items
     and not exists (
       select 1 from unnest(arr) as t(v)
       where v is null or char_length(btrim(v)) not between 1 and max_len
     );
$$;
revoke execute on function private.tags_ok(text[], int, int) from public;
grant execute on function private.tags_ok(text[], int, int) to authenticated, service_role;

-- ============ new columns ============
-- Fixed lists must match lib/profile/options.ts.
alter table public.profiles
  add column gender text
    check (gender in ('woman', 'man', 'non_binary', 'other')),                 -- PRIVATE, optional
  add column languages text[] not null default '{}'
    check (cardinality(languages) <= 10 and languages <@ array[
      'en','de','zh','es','fr','it','pt','ru','ja','ko',
      'ar','tr','pl','nl','hi','uk','sv','da','el','vi']::text[]),
  add column home_city text
    check (char_length(btrim(home_city)) between 1 and 80),
  add column bio text
    check (char_length(bio) <= 500),
  add column visited_cities text[] not null default '{}'
    check (private.tags_ok(visited_cities, 50, 80)),
  add column hobbies text[] not null default '{}'
    check (private.tags_ok(hobbies, 20, 30)),
  add column pref_age_min smallint not null default 18
    check (pref_age_min between 18 and 99),                                     -- PRIVATE
  add column pref_age_max smallint not null default 99
    check (pref_age_max between 18 and 99),                                     -- PRIVATE
  add column pref_gender text
    check (pref_gender in ('woman', 'man', 'non_binary')),                      -- PRIVATE, null = anyone
  add column travel_pace smallint
    check (travel_pace between 1 and 5),                                        -- 1 every hour planned … 5 go with the flow
  add column day_rhythm text
    check (day_rhythm in ('early_bird', 'flexible', 'night_owl')),
  add column travel_interests text[] not null default '{}'
    check (travel_interests <@ array[
      'museums_galleries','history_architecture','nature_hiking','theme_parks',
      'food_markets','cafes','nightlife_bars','shopping','photography',
      'local_hidden_spots','sports_outdoor','festivals_concerts']::text[]),
  add column onboarding_completed_at timestamptz;

alter table public.profiles
  add constraint profiles_pref_age_order check (pref_age_min <= pref_age_max),
  -- Database-level onboarding gate: nobody can mark onboarding done with required fields missing.
  add constraint profiles_onboarding_complete check (
    onboarding_completed_at is null or (
          birth_year is not null
      and cardinality(languages) >= 1
      and home_city is not null
      and travel_pace is not null
      and day_rhythm is not null
      and cardinality(travel_interests) >= 1
    )
  );

-- ============ birth year: locked once set (was: only "cannot be cleared") ============
create or replace function public.enforce_adult_birth_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.birth_year is not null
     and new.birth_year is distinct from old.birth_year then
    raise exception 'Birth year cannot be changed'
      using errcode = 'check_violation';
  end if;

  if new.birth_year is not null
     and new.birth_year > extract(year from now())::int - 19 then
    raise exception 'Users must be 18 or older'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ============ column-level privacy (fixes known issue #3) ============
-- Revoking table-level SELECT also removes column SELECT grants; we re-grant public columns only.
revoke select on public.profiles from authenticated;
grant select (id, display_name, languages, home_city, bio, visited_cities, hobbies,
              travel_pace, day_rhythm, travel_interests, onboarding_completed_at, created_at)
  on public.profiles to authenticated;
-- Owner edits (row restricted by the existing "owner can update" RLS policy).
-- display_name and birth_year were granted in phase 1; birth_year is locked by the trigger.
grant update (gender, languages, home_city, bio, visited_cities, hobbies,
              pref_age_min, pref_age_max, pref_gender, travel_pace, day_rhythm,
              travel_interests, onboarding_completed_at)
  on public.profiles to authenticated;

-- ============ age range for other users (never the exact year) ============
-- security definer: must read the hidden birth_year. Lives in the unexposed private schema,
-- so it is only reachable through the public_profiles view. Age = current year - birth year.
create or replace function private.age_range(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when x.age is null then null
           when x.age < 25 then '18–24'
           when x.age < 30 then '25–29'
           when x.age < 35 then '30–34'
           when x.age < 40 then '35–39'
           when x.age < 50 then '40–49'
           when x.age < 60 then '50–59'
           else '60+'
         end
  from (select extract(year from now())::int - p.birth_year as age
        from public.profiles p
        where p.id = p_user_id) as x;
$$;
revoke execute on function private.age_range(uuid) from public, anon;
grant execute on function private.age_range(uuid) to authenticated, service_role;

-- ============ public profile view (security_invoker: runs with the caller's rights) ============
create view public.public_profiles
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
       p.travel_interests
from public.profiles p
where p.onboarding_completed_at is not null;

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- ============ owner reads own private fields ============
-- No arguments: always the caller's own row (auth.uid()). Signed-in users only.
create or replace function public.get_my_private_profile()
returns table (birth_year smallint, gender text, pref_age_min smallint,
               pref_age_max smallint, pref_gender text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.birth_year, p.gender, p.pref_age_min, p.pref_age_max, p.pref_gender
  from public.profiles p
  where p.id = (select auth.uid());
$$;
revoke execute on function public.get_my_private_profile() from public, anon;
grant execute on function public.get_my_private_profile() to authenticated;
