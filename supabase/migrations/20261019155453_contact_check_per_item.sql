-- PR #8 review W1 + S1.
-- W1  List fields were checked as ONE joined string, so digits from neighbouring items could
--     join into a fake "phone number" (["Chess Elo 1850", "10000 steps"] → "1850 10000" was
--     refused although the app accepts it). Lists are now checked item by item — exactly like
--     the app (lib/profile/validate.ts, lib/posts/card.ts): hobbies, cities visited, and the two
--     plan headline lines.
-- S1  save_my_match_reasons: an item without a post_id is skipped (it failed the whole batch),
--     and a non-array argument gets its own message.
--
-- Compatible with main: only relaxes a check (accepts more valid input, refuses the same real
-- contact details) and keeps every function signature.

-- True when ANY item of the list contains contact details (same detector as for single fields).
create or replace function private.any_contact_details(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (select 1 from unnest(coalesce(items, '{}')) as t(v) where private.has_contact_details(t.v));
$$;
revoke execute on function private.any_contact_details(text[]) from public, anon, authenticated;
-- posts_guard runs as the writer: definer functions (owner) or local scripts (service role).
grant execute on function private.any_contact_details(text[]) to service_role;

-- ============ profiles: per-item check for hobbies and cities visited ============
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
       and private.any_contact_details(new.visited_cities) then
    raise exception 'Contact details are not allowed in profiles' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function private.profiles_guard() from public, anon, authenticated;

-- ============ posts: per-line check for the two headline lines (rest unchanged) ============
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
     or private.any_contact_details(new.headline) then
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

-- ============ S1: items without a post_id are skipped; clear message for non-arrays ============
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
  if jsonb_typeof(p_reasons) is distinct from 'array' then
    raise exception 'Reasons must be a JSON array' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_reasons) > 10 then
    raise exception 'At most 10 reasons per call' using errcode = 'check_violation';
  end if;
  select id into my_post from public.posts where user_id = (select auth.uid()) and status = 'active';
  if my_post is null then
    raise exception 'No active post' using errcode = 'no_data_found';
  end if;
  -- The caller's current matches, computed once.
  select coalesce(array_agg(m.post_id), '{}') into allowed from public.match_my_post() m;
  for item in select * from jsonb_array_elements(p_reasons) loop
    if (item->>'post_id') is null or not ((item->>'post_id')::uuid = any (allowed)) then
      continue;  -- missing id, or not one of the caller's current matches
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
