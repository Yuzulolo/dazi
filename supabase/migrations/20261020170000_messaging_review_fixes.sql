-- Phase 7b-1 review fixes (ai-code-reviewer M1–M3, S7) for 20261020160000_messaging.sql.
-- create or replace of three existing functions, same signatures and grants. No new tables.
--
-- M1  The shared demo login is one account for every visitor, so its chat is readable by every
--     later visitor: send_message refuses contact details when either side is_protected.
-- M2  "Already connected" is checked in BOTH directions between the two current plans, so the
--     other person can't open a second pending invite (or chat) for a pair that is connected.
-- M3  Mutual invites sent at the same moment: send_invite also takes a lock on the PAIR of
--     users, so the second call always sees the first one's pending invite and auto-accepts.
-- S7  my_invites(): a receiver no longer sees invites the sender cancelled (no growing list of
--     withdrawn notes). The sender still sees them as "Cancelled".
--
-- The RAISE texts are matched in app/messaging/actions.ts (REFUSALS) — keep them in sync.
-- Who runs what: unchanged (definer = owner; callers authenticated).
-- Compatible with main: main has no messaging code; signatures and grants unchanged.

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
  -- M3: one lock per PAIR (mutual invites at the same moment) + one per sender (10-pending cap).
  perform pg_advisory_xact_lock(hashtextextended('invite-pair:' || least(uid, target)::text || greatest(uid, target)::text, 0));
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

  -- M2: already connected for these two plans, in either direction.
  if exists (
    select 1 from public.invites i
    where i.status = 'accepted'
      and ((i.from_post = my_post and i.to_post = p_to_post) or (i.from_post = p_to_post and i.to_post = my_post))
  ) then
    raise exception 'You are already connected' using errcode = 'unique_violation';
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
  where i.from_post = my_post and i.to_post = p_to_post and i.status in ('pending', 'declined');
  if found then
    raise exception '%', case existing.status
      when 'declined' then 'They declined an invite for this plan'
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
  -- M1: contact details are fine between two real people who both accepted — but NOT in a chat
  -- of the shared demo login, which every visitor can read.
  if private.has_contact_details(body) and exists (
    select 1 from public.profiles p where p.id in (inv.from_user, inv.to_user) and p.is_protected
  ) then
    raise exception 'Contact details are not allowed in the shared demo chat' using errcode = 'check_violation';
  end if;
  -- Rate limit: 30 per rolling hour per sender.
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
    and not (i.to_user = (select auth.uid()) and i.status = 'cancelled')   -- S7
  order by i.created_at desc;
$$;
