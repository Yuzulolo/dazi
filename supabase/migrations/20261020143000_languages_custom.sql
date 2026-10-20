-- Phase 7a PR B: languages become a searchable list with custom entries (docs/SPEC.md §0.4a).
-- Known languages stay ISO codes ('en', 'de', …); a language that isn't in the app's list is
-- stored as its normalised name ('Swahili'). The app normalises (lib/profile/languages.ts):
-- trim, case, aliases ("Englisch" → en, "中文" → zh), max 8 languages, each ≤ 30 characters.
--
-- 1. The fixed-list CHECK (20 codes, ≤ 10 items) is replaced by a shape check: ≤ 10 items,
--    each 1..30 characters after trimming (private.tags_ok, as for hobbies / cities).
--    10 stays the DB limit so the code on main (which allows 10) keeps working; the app caps at 8.
-- 2. profiles_guard also refuses contact details in languages (they are free text now).
--    Still SECURITY DEFINER: authenticated users update profiles directly and have no
--    EXECUTE on private helpers. Writers of profiles: authenticated (own row, column grants),
--    service_role (scripts), definer functions. Everything else in the guard is unchanged.
--
-- Accepted: the database checks the shape only, so someone writing through the Data API directly
-- could store an un-normalised value ("english") — that only hurts their own matching.
--
-- Expand-only and compatible with main: accepts everything main writes today (codes, ≤ 10);
-- no column, grant, view or function signature changes. Matching (languages && languages)
-- is unchanged.

-- ============ 1. replace the fixed-list CHECK on profiles.languages ============
do $$
declare
  c record;
  n int := 0;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%languages <@%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
    n := n + 1;
  end loop;
  if n <> 1 then
    raise exception 'Expected exactly one fixed-list languages CHECK, found %', n;
  end if;
end;
$$;

alter table public.profiles
  add constraint profiles_languages_check check (private.tags_ok(languages, 10, 30));

-- ============ 2. profiles_guard: contact details in languages ============
create or replace function private.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
       and private.has_contact_details(new.display_name)
     or (tg_op = 'INSERT' or new.bio is distinct from old.bio)
       and private.has_contact_details(new.bio)
     or (tg_op = 'INSERT' or new.home_city is distinct from old.home_city)
       and private.has_contact_details(new.home_city)
     or (tg_op = 'INSERT' or new.hobbies is distinct from old.hobbies)
       and private.any_contact_details(new.hobbies)
     or (tg_op = 'INSERT' or new.visited_cities is distinct from old.visited_cities)
       and private.any_contact_details(new.visited_cities)
     or (tg_op = 'INSERT' or new.languages is distinct from old.languages)
       and private.any_contact_details(new.languages) then
    raise exception 'Contact details are not allowed in profiles' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.profiles_guard() from public, anon, authenticated;
