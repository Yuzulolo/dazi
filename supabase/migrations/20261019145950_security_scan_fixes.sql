-- Security scan fixes (docs/SECURITY-AUDIT.md): H1, M1, M2, L1.
-- H1  The database itself refuses phone numbers / emails in profile text (until now only the app
--     checked) — only for fields that CHANGE, so existing rows never block anything.
-- M2  Signed-in users can read their own profile and onboarded profiles only (was: every row,
--     including half-finished sign-ups). Column grants are unchanged.
-- M1  public.reset_demo_ai_quota(): clears the AI counters of the protected demo login only
--     (no user-id parameter), executable by the service role only (reset script).
-- L1  save_my_match_reasons: at most 10 items, and the caller's matches are computed once.
--
-- Expand-only / compatible with main: main validates profile text in the app before saving
-- (so the trigger never fires for it), only reads its own row and public_profiles (onboarded
-- rows), and calls save_my_match_reasons with ≤ 5 items.

-- ============ H1: no contact details in profiles (database-level) ============
-- SECURITY DEFINER on purpose: profile edits run as `authenticated`, which has no EXECUTE on
-- private.has_contact_details (revoked in 20261017225104). As a definer function the check runs
-- as its owner on every path — direct profile UPDATEs by users (onboarding, /me/edit), the
-- sign-up insert via handle_new_user (itself a definer), and service-role scripts.
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
       and private.has_contact_details(array_to_string(new.hobbies, ' '))
     or (tg_op = 'INSERT' or new.visited_cities is distinct from old.visited_cities)
       and private.has_contact_details(array_to_string(new.visited_cities, ' ')) then
    raise exception 'Contact details are not allowed in profiles' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.profiles_guard() from public, anon, authenticated;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function private.profiles_guard();

-- ============ M2: own profile or onboarded profiles only ============
drop policy if exists "profiles: signed-in users can read" on public.profiles;
create policy "profiles: read own or onboarded"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or onboarding_completed_at is not null);

-- ============ M1: clear the demo login's AI counters (service role only) ============
-- No parameter: it can only ever touch the account flagged is_protected.
create or replace function public.reset_demo_ai_quota()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleared int;
begin
  delete from private.ai_calls
   where user_id in (select p.id from public.profiles p where p.is_protected);
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;
revoke execute on function public.reset_demo_ai_quota() from public, anon, authenticated;
grant execute on function public.reset_demo_ai_quota() to service_role;

-- ============ L1: bounded reasons save, matches computed once ============
create or replace function public.save_my_match_reasons(p_reasons jsonb, p_generated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_post uuid;
  allowed uuid[];
  item    jsonb;
  stamp   timestamptz := least(now(), greatest(coalesce(p_generated_at, now()), now() - interval '10 minutes'));
begin
  if jsonb_typeof(p_reasons) <> 'array' or jsonb_array_length(p_reasons) > 10 then
    raise exception 'At most 10 reasons per call' using errcode = 'check_violation';
  end if;
  select id into my_post from public.posts where user_id = (select auth.uid()) and status = 'active';
  if my_post is null then
    raise exception 'No active post' using errcode = 'no_data_found';
  end if;
  -- The caller's current matches, computed ONCE (was: once per item).
  select coalesce(array_agg(m.post_id), '{}') into allowed from public.match_my_post() m;
  for item in select * from jsonb_array_elements(p_reasons) loop
    if not ((item->>'post_id')::uuid = any (allowed)) then
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
