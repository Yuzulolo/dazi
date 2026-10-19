-- Phase 5: GDPR "Delete my data" (CLAUDE.md, SPEC §0.2 G) + protected demo login account.
-- Every user table already cascades from auth.users (verified by the check query):
--   auth.users ─┬─► public.profiles (id, on delete cascade)
--               │      └─► public.posts (user_id, on delete cascade)
--               │             └─► private.match_reasons (viewer_post_id / candidate_post_id, cascade)
--               └─► private.ai_calls (user_id, on delete cascade)
-- Supabase's own auth.sessions / auth.identities / auth.refresh_tokens also cascade.
-- Deleting an account also deletes its AI-usage rows; the site-wide daily ceiling
-- (1,000 calls / 24 h) still caps cost (accepted trade-off, FLOWS).
-- Expand-only: a new column with a default and a new function; nothing on main uses either.

-- The public demo login (shown in README for graders) must never be deletable.
-- Not readable or writable by clients (no column grant).
alter table public.profiles add column is_protected boolean not null default false;

update public.profiles
   set is_protected = true
 where id = (select id from auth.users where email = 'xiangquyuanfang+demo@hotmail.com');

-- Deletes the CALLER's account and, through the cascades above, all of their data.
-- Refuses demo users (is_demo) and protected accounts (the public demo login).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.profiles p where p.id = uid and (p.is_demo or p.is_protected)) then
    raise exception 'This account cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
