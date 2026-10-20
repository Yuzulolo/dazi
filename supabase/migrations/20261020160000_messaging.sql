-- Phase 7b-1: invites + messages + block (docs/SPEC.md §0.4c, docs/FLOWS.md 2.2 / 2.3 / 2.5).
-- The app only shows any of this when the server-only env var MESSAGING_ENABLED = "true"
-- (Preview). The database is shared with production, so every rule lives HERE, not in the UI.
--
-- 1. Tables public.invites, public.messages, public.blocks — RLS on, clients may only SELECT
--    their own rows (policies below); every write goes through the definer functions in 4.
--    Every user column cascades from public.profiles (→ auth.users), so "Delete my data"
--    removes a user's invites, messages and blocks (the other person's thread goes too).
-- 2. "expired" is never stored: a pending invite is expired when either plan is no longer
--    active or has ended (Berlin date). No cron.
-- 3. Demo isolation: the shared public demo login (profiles.is_protected) can only interact
--    with seeded demo profiles (is_demo); real users can't invite or message it.
-- 4. RPCs (SECURITY DEFINER, set search_path = '', pinned to auth.uid(), EXECUTE for
--    authenticated only): send_invite, respond_invite, cancel_invite, send_message,
--    block_from_invite, my_invites, my_pending_invite_count.
-- 5. private.match_candidates gets ONE extra filter (not blocked, either direction). It is
--    rebuilt from the LIVE definition (pg_get_functiondef), not from an older migration file,
--    and refuses to run unless the age-band filter is present and the hook appears once.
--
-- Which role runs what:
--   * RPCs and private helpers: the function owner (definer). Callers: authenticated.
--   * Policy on messages: evaluated as authenticated → calls private.can_chat (definer,
--     granted to authenticated, answers only for auth.uid()).
--   * match_candidates: invoker, only ever called by the definer wrappers match_my_post /
--     match_suggestion / match_candidates_for_eval → runs as owner (unchanged).
--   * No triggers on the new tables.
--   * scripts/reset-demo-account.mjs and scripts/rls-check.mjs: service_role, direct writes.
--   * delete_my_account (definer) → FK cascades.
--
-- Expand-only and compatible with main: new tables / functions only; match_candidates keeps
-- its signature and grants and returns the same rows while public.blocks is empty.

-- ============ 1. tables ============
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  from_post    uuid not null references public.posts (id) on delete cascade,
  to_post      uuid not null references public.posts (id) on delete cascade,
  note         text check (note is null or char_length(note) between 1 and 300),
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint invites_not_self check (from_user <> to_user)
);
-- One invite per plan pair: no re-invite after a decline (or while pending / accepted).
-- A cancelled invite doesn't count, so the sender may invite again later.
create unique index invites_once_per_plan_pair on public.invites (from_post, to_post)
  where status in ('pending', 'accepted', 'declined');
create index invites_from_user on public.invites (from_user, status);
create index invites_to_user on public.invites (to_user, status);
create index invites_to_post on public.invites (to_post);

create table public.messages (
  id         bigint generated always as identity primary key,
  invite_id  uuid not null references public.invites (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_invite on public.messages (invite_id, created_at);
create index messages_sender on public.messages (sender_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

alter table public.invites enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
revoke all on public.invites, public.messages, public.blocks from public, anon, authenticated;
grant select on public.invites, public.messages, public.blocks to authenticated;

-- ============ 2. private helpers ============
-- True when either user blocked the other.
create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  );
$$;
revoke execute on function private.is_blocked(uuid, uuid) from public, anon, authenticated;

-- False when one side is the shared demo login and the other is NOT a seeded demo profile.
create or replace function private.demo_pair_ok(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p join public.profiles q on (p.id, q.id) in ((a, b), (b, a))
    where p.is_protected and not q.is_demo
  );
$$;
revoke execute on function private.demo_pair_ok(uuid, uuid) from public, anon, authenticated;

-- Stored status, with "expired" computed for pending invites whose plans ended or closed.
create or replace function private.invite_status(i public.invites)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when i.status = 'pending' and exists (
      select 1 from public.posts p
      where p.id in (i.from_post, i.to_post)
        and (p.status <> 'active' or p.end_date < (now() at time zone 'Europe/Berlin')::date)
    ) then 'expired'
    else i.status
  end;
$$;
revoke execute on function private.invite_status(public.invites) from public, anon, authenticated;

-- May the caller read / write this chat? Accepted, participant, not blocked, demo-isolated.
create or replace function private.can_chat(p_invite uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invites i
    where i.id = p_invite
      and i.status = 'accepted'
      and (select auth.uid()) in (i.from_user, i.to_user)
      and not private.is_blocked(i.from_user, i.to_user)
      and private.demo_pair_ok(i.from_user, i.to_user)
  );
$$;
revoke execute on function private.can_chat(uuid) from public, anon;
grant execute on function private.can_chat(uuid) to authenticated;

-- ============ RLS policies (SELECT only; there are no write grants) ============
create policy "participants read their invites" on public.invites
  for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "participants read an open chat" on public.messages
  for select to authenticated
  using (private.can_chat(invite_id));
create policy "blockers read their blocks" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

-- ============ 3. RPCs ============
create or replace function public.send_invite(p_to_post uuid, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  today    date := (now() at time zone 'Europe/Berlin')::date;
  note     text := nullif(btrim(coalesce(p_note, '')), '');
  target   uuid;
  my_post  uuid;
  existing public.invites;
  new_id   uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  select o.user_id into target from public.posts o where o.id = p_to_post;
  if target is null then
    raise exception 'Not one of your matches' using errcode = 'insufficient_privilege';
  end if;
  -- Before the match check, so a refusal always says why (and is tested for this reason).
  if not private.demo_pair_ok(uid, target) then
    raise exception 'The shared demo account can only connect with demo profiles'
      using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invite:' || uid::text, 0));

  select p.id into my_post from public.posts p
  where p.user_id = uid and p.status = 'active' and p.end_date >= today;
  if my_post is null then
    raise exception 'No active post' using errcode = 'no_data_found';
  end if;
  -- Only someone currently in my matches (hard filters incl. blocks, both directions).
  if not exists (select 1 from public.match_my_post() m where m.post_id = p_to_post) then
    raise exception 'Not one of your matches' using errcode = 'insufficient_privilege';
  end if;
  if note is not null and char_length(note) > 300 then
    raise exception 'Invite note: up to 300 characters' using errcode = 'check_violation';
  end if;
  if note is not null and private.has_contact_details(note) then
    raise exception 'Contact details are not allowed in invite notes' using errcode = 'check_violation';
  end if;

  -- Mutual: they already invited my current plan → that invite is accepted, chat opens.
  select * into existing from public.invites i
  where i.from_user = target and i.to_user = uid and i.to_post = my_post and i.status = 'pending'
    and private.invite_status(i) = 'pending'
  for update;
  if found then
    update public.invites set status = 'accepted', responded_at = now() where id = existing.id;
    return existing.id;
  end if;

  select * into existing from public.invites i
  where i.from_post = my_post and i.to_post = p_to_post and i.status in ('pending', 'accepted', 'declined');
  if found then
    raise exception '%', case existing.status
      when 'declined' then 'They declined an invite for this plan'
      when 'accepted' then 'You are already connected'
      else 'You already invited them' end
      using errcode = 'unique_violation';
  end if;

  if (select count(*) from public.invites i
      where i.from_user = uid and i.status = 'pending' and private.invite_status(i) = 'pending') >= 10 then
    raise exception 'At most 10 pending invites' using errcode = 'check_violation';
  end if;

  insert into public.invites (from_user, to_user, from_post, to_post, note)
  values (uid, target, my_post, p_to_post, note)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.respond_invite(p_invite uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites;
begin
  select * into inv from public.invites where id = p_invite and to_user = uid for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'no_data_found';
  end if;
  if not private.demo_pair_ok(inv.from_user, inv.to_user) then
    raise exception 'The shared demo account can only connect with demo profiles'
      using errcode = 'insufficient_privilege';
  end if;
  if private.is_blocked(inv.from_user, inv.to_user) or private.invite_status(inv) <> 'pending' then
    raise exception 'This invite is no longer open' using errcode = 'check_violation';
  end if;
  update public.invites
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = inv.id;
end;
$$;

create or replace function public.cancel_invite(p_invite uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.invites;
begin
  select * into inv from public.invites where id = p_invite and from_user = uid for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'no_data_found';
  end if;
  if private.invite_status(inv) <> 'pending' then
    raise exception 'This invite is no longer open' using errcode = 'check_violation';
  end if;
  update public.invites set status = 'cancelled', responded_at = now() where id = inv.id;
end;
$$;

create or replace function public.send_message(p_invite uuid, p_body text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  body   text := btrim(coalesce(p_body, ''));
  inv    public.invites;
  new_id bigint;
begin
  select * into inv from public.invites where id = p_invite and uid in (from_user, to_user);
  if not found then
    raise exception 'Chat not found' using errcode = 'no_data_found';
  end if;
  if not private.demo_pair_ok(inv.from_user, inv.to_user) then
    raise exception 'The shared demo account can only connect with demo profiles'
      using errcode = 'insufficient_privilege';
  end if;
  if inv.status <> 'accepted' then
    raise exception 'You can send messages once the invite is accepted' using errcode = 'check_violation';
  end if;
  if private.is_blocked(inv.from_user, inv.to_user) then
    raise exception 'This chat is closed' using errcode = 'check_violation';
  end if;
  if char_length(body) not between 1 and 1000 then
    raise exception 'Messages: 1 to 1000 characters' using errcode = 'check_violation';
  end if;
  -- Contact details ARE allowed here (both people accepted). Rate limit: 30 per rolling hour.
  perform pg_advisory_xact_lock(hashtextextended('message:' || uid::text, 0));
  if (select count(*) from public.messages m
      where m.sender_id = uid and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'At most 30 messages per hour' using errcode = 'check_violation';
  end if;
  insert into public.messages (invite_id, sender_id, body) values (inv.id, uid, body)
  returning id into new_id;
  return new_id;
end;
$$;

-- Block the other person of one of my invites: hides both from each other's matches,
-- cancels every pending invite between them, closes the chat (private.can_chat).
create or replace function public.block_from_invite(p_invite uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid   uuid := (select auth.uid());
  inv   public.invites;
  other uuid;
begin
  select * into inv from public.invites where id = p_invite and uid in (from_user, to_user);
  if not found then
    raise exception 'Invite not found' using errcode = 'no_data_found';
  end if;
  other := case when inv.from_user = uid then inv.to_user else inv.from_user end;
  insert into public.blocks (blocker_id, blocked_id) values (uid, other) on conflict do nothing;
  update public.invites set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and ((from_user = uid and to_user = other) or (from_user = other and to_user = uid));
end;
$$;

-- My invites, received and sent. Other person + their plan with the SAME safe columns as
-- match_my_post() (no user id, birth year, gender, preferences or embeddings).
-- Status: pending / accepted / declined / cancelled / expired, or "closed" after a block.
create or replace function public.my_invites()
returns table (
  invite_id uuid, direction text, status text, note text, created_at timestamptz,
  responded_at timestamptz, post_id uuid, headline text[], tone text, city text,
  overlap_start date, overlap_end date, interests text[],
  display_name text, age_range text, languages text[], is_demo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id,
         case when i.from_user = (select auth.uid()) then 'sent' else 'received' end,
         case when private.is_blocked(i.from_user, i.to_user) and i.status = 'accepted' then 'closed'
              else private.invite_status(i) end,
         i.note, i.created_at, i.responded_at,
         op.id, op.headline, op.tone, op.city,
         greatest(mp.start_date, op.start_date), least(mp.end_date, op.end_date), op.interests,
         pr.display_name, private.age_range(pr.id), pr.languages, pr.is_demo
  from public.invites i
  join public.posts mp on mp.id = case when i.from_user = (select auth.uid()) then i.from_post else i.to_post end
  join public.posts op on op.id = case when i.from_user = (select auth.uid()) then i.to_post else i.from_post end
  join public.profiles pr on pr.id = op.user_id
  where (select auth.uid()) in (i.from_user, i.to_user)
  order by i.created_at desc;
$$;

-- Live pending invites I received (header count).
create or replace function public.my_pending_invite_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.invites i
  where i.to_user = (select auth.uid()) and i.status = 'pending'
    and private.invite_status(i) = 'pending'
    and not private.is_blocked(i.from_user, i.to_user);
$$;

revoke execute on function public.send_invite(uuid, text) from public, anon;
revoke execute on function public.respond_invite(uuid, boolean) from public, anon;
revoke execute on function public.cancel_invite(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.block_from_invite(uuid) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.my_pending_invite_count() from public, anon;
grant execute on function public.send_invite(uuid, text) to authenticated;
grant execute on function public.respond_invite(uuid, boolean) to authenticated;
grant execute on function public.cancel_invite(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.block_from_invite(uuid) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.my_pending_invite_count() to authenticated;

-- ============ 5. matching: not blocked (either direction), from the LIVE definition ============
do $$
declare
  fn    regprocedure := 'private.match_candidates(uuid, real, real, real, integer, integer)'::regprocedure;
  def   text := pg_get_functiondef(fn);
  hook  text := 'PART G HOOK (blocks)';
  hooks int := (length(def) - length(replace(def, hook, ''))) / length(hook);
begin
  if def not like '%private.age_band(private.age_of(op.birth_year)) between me.pref_band_min and me.pref_band_max%' then
    raise exception 'Live match_candidates has no age-band filter — stop, nothing changed';
  end if;
  if hooks <> 1 then
    raise exception 'Expected the block hook exactly once in live match_candidates, found %', hooks;
  end if;
  def := regexp_replace(
    def,
    '--[^\n]*PART G HOOK \(blocks\)[^\n]*',
    'and not private.is_blocked(me.uid, op.id)                       -- not blocked, either direction (phase 7b)'
  );
  execute def;
end;
$$;
