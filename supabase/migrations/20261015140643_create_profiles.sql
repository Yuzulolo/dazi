-- Phase 1: profiles table, auto-created for every new auth user, with RLS.
-- See docs/SPEC.md §6 and docs/FLOWS.md 2.0 (birth year gate).

-- ============ profiles: one row per auth user ============
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  birth_year   smallint check (birth_year between 1900 and 2100), -- null allowed: Google users enter it on /onboarding (FLOWS 2.0)
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Travel identity. One row per auth.users row, created by the on_auth_user_created trigger.';

-- ============ 18+ rule (strict: birth year <= current year - 19) ============
-- Runs on insert AND on any later change of birth_year, so it can't be bypassed by an update.
create or replace function public.enforce_adult_birth_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Once set, birth year can never be cleared again (would re-open the onboarding gate).
  if tg_op = 'UPDATE' and old.birth_year is not null and new.birth_year is null then
    raise exception 'Birth year cannot be removed'
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

create trigger profiles_enforce_adult
  before insert or update of birth_year on public.profiles
  for each row execute function public.enforce_adult_birth_year();

-- ============ auto-create a profile for every new auth user ============
-- security definer: needed because a brand-new user has no permission to insert into profiles.
-- If this fails (e.g. under-18), the whole sign-up is rolled back: nothing is stored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, birth_year)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),   -- Google (later in phase 1)
      'Traveller'
    ), 50),
    nullif(new.raw_user_meta_data ->> 'birth_year', '')::smallint
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions must never be callable through the API.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.enforce_adult_birth_year() from public, anon, authenticated;

-- ============ Data API access (table-level) ============
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;                            -- guests: no access at all
grant update (display_name, birth_year) on public.profiles to authenticated; -- id / created_at can never be changed

-- ============ Row Level Security (row-level) ============
alter table public.profiles enable row level security;

-- SELECT: any signed-in user may read profiles.
-- (Phase 2 moves other users' reads to a public-columns view, SPEC §6.)
create policy "profiles: signed-in users can read"
  on public.profiles for select
  to authenticated
  using (true);

-- UPDATE: only the owner, and they can't re-assign the row to someone else.
create policy "profiles: owner can update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- INSERT: intentionally NO policy -> denied. Rows are created only by the handle_new_user trigger.
-- DELETE: intentionally NO policy -> denied. Rows disappear when the auth user is deleted (on delete cascade);
--         "Delete my data" (phase 8) deletes the auth user server-side.
