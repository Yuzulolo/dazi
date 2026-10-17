-- Phase 3 / part C: posts with AI extraction + embeddings, and a per-user AI quota.
-- See docs/SPEC.md §0.2 C, §6, §7 and docs/FLOWS.md 2.1, 2.6.
-- Expand-only: nothing on main reads or writes these objects.
--
-- Privacy: posts are OWNER-ONLY for direct reads. Other users' posts are only ever
-- returned by the part D matching function (server-side, applies every hard filter —
-- incl. mutual age/gender preferences and blocks — and returns only the needed fields).
-- Nobody but that function reads the embedding column.

create extension if not exists vector with schema extensions;

-- ============ helper: has the caller finished onboarding? ============
-- security definer so the insert policy can ask cheaply; scoped to auth.uid(), no arguments.
create or replace function private.is_onboarded()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.onboarding_completed_at is not null
  );
$$;
revoke execute on function private.is_onboarded() from public, anon;
grant execute on function private.is_onboarded() to authenticated, service_role;

-- ============ posts ============
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  raw_text    text not null check (char_length(raw_text) between 1 and 500),   -- contact details already stripped
  city        text not null check (char_length(btrim(city)) between 1 and 80),
  start_date  date not null,
  end_date    date not null,
  interests   text[] not null check (
                cardinality(interests) between 1 and 5
                and interests <@ array[
                  'museums_galleries','history_architecture','nature_hiking','theme_parks',
                  'food_markets','cafes','nightlife_bars','shopping','photography',
                  'local_hidden_spots','sports_outdoor','festivals_concerts']::text[]),
  budget      text check (budget in ('low', 'medium', 'high')),               -- null = not specified
  vibe        text check (char_length(vibe) <= 120),
  headline    text[] not null check (cardinality(headline) = 2 and private.tags_ok(headline, 2, 22)),
  tone        text not null check (tone in ('lavender', 'forest', 'mint', 'pink')),
  ai_assisted boolean not null default false,
  embedding   extensions.vector(1536) not null,
  status      text not null default 'active' check (status in ('active', 'closed', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint posts_date_order check (end_date >= start_date),
  constraint posts_date_span  check (end_date - start_date <= 60)
);

-- Max 1 active post per user (FLOWS 2.1).
create unique index posts_one_active_per_user on public.posts (user_id) where status = 'active';
-- Part D hard filters: city + overlapping dates on active posts.
create index posts_active_city_dates on public.posts (lower(city), start_date, end_date) where status = 'active';
-- Part D similarity search.
create index posts_embedding_hnsw on public.posts using hnsw (embedding extensions.vector_cosine_ops);
-- Owner history / FK lookups.
create index posts_user_created on public.posts (user_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function private.set_updated_at();

-- ============ RLS: owner-only ============
alter table public.posts enable row level security;

create policy "posts: owner reads own posts"
  on public.posts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "posts: onboarded owner creates"
  on public.posts for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_onboarded()));

create policy "posts: owner updates"
  on public.posts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "posts: owner deletes"
  on public.posts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Guests (anon): no access at all. Signed-in users: own rows only (RLS above), and
-- never the embedding column — not even their own (only server-side functions use it).
revoke all on public.posts from anon, authenticated;
grant select (id, user_id, raw_text, city, start_date, end_date, interests, budget, vibe,
              headline, tone, ai_assisted, status, created_at, updated_at)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;
grant insert (user_id, raw_text, city, start_date, end_date, interests, budget, vibe,
              headline, tone, ai_assisted, embedding)
  on public.posts to authenticated;
grant update (raw_text, city, start_date, end_date, interests, budget, vibe,
              headline, tone, embedding, status)
  on public.posts to authenticated;

-- ============ publish: archive the old active post + insert the new one, in one transaction ============
-- security invoker: runs with the caller's rights, so every RLS policy above still applies.
create or replace function public.publish_post(
  p_raw_text text, p_city text, p_start_date date, p_end_date date, p_interests text[],
  p_budget text, p_vibe text, p_headline text[], p_tone text, p_ai_assisted boolean,
  p_embedding text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  update public.posts set status = 'archived'
   where user_id = (select auth.uid()) and status = 'active';

  insert into public.posts (user_id, raw_text, city, start_date, end_date, interests, budget,
                            vibe, headline, tone, ai_assisted, embedding)
  values ((select auth.uid()), p_raw_text, p_city, p_start_date, p_end_date, p_interests, p_budget,
          p_vibe, p_headline, p_tone, p_ai_assisted, p_embedding::extensions.vector)
  returning id into new_id;

  return new_id;
end;
$$;
revoke execute on function public.publish_post(text, text, date, date, text[], text, text, text[], text, boolean, text) from public, anon;
grant execute on function public.publish_post(text, text, date, date, text[], text, text, text[], text, boolean, text) to authenticated;

-- ============ AI cost protection: 20 AI calls per user per rolling 24 h ============
-- Lives in the unexposed private schema: no client can read or write it directly.
create table private.ai_calls (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('extract', 'embed')),
  created_at timestamptz not null default now()
);
create index ai_calls_user_time on private.ai_calls (user_id, created_at desc);
alter table private.ai_calls enable row level security;   -- no policies: only the function below touches it
revoke all on private.ai_calls from public, anon, authenticated;

-- Returns true and records the call if the caller is under the limit; false otherwise.
create or replace function public.consume_ai_quota(p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid  uuid := (select auth.uid());
  used int;
begin
  if uid is null or p_kind not in ('extract', 'embed') then
    return false;
  end if;
  -- One caller at a time per user, so two parallel requests can't both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  delete from private.ai_calls where user_id = uid and created_at < now() - interval '2 days';
  select count(*) into used from private.ai_calls
   where user_id = uid and created_at > now() - interval '24 hours';
  if used >= 20 then
    return false;
  end if;
  insert into private.ai_calls (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
