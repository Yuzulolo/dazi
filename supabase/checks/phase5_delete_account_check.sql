-- Read-only check for migration 20261019132938_delete_account.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

-- 1. Every foreign key that points at a user, a profile or a post, and what happens on delete.
--    Expected: on_delete = CASCADE in every row.
select 'FK ' || src_ns.nspname || '.' || src.relname || ' → ' || dst_ns.nspname || '.' || dst.relname as check,
       case c.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'r' then 'RESTRICT'
                          when 'a' then 'NO ACTION' when 'd' then 'SET DEFAULT' end as result
  from pg_constraint c
  join pg_class src on src.oid = c.conrelid
  join pg_namespace src_ns on src_ns.oid = src.relnamespace
  join pg_class dst on dst.oid = c.confrelid
  join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
  where c.contype = 'f'
    and (dst_ns.nspname, dst.relname) in (('auth', 'users'), ('public', 'profiles'), ('public', 'posts'))
    and src_ns.nspname in ('public', 'private')
union all
-- 2. Exactly one protected account (the public demo login).
select 'protected accounts', count(*)::text
  from public.profiles where is_protected
union all
select 'protected account email (should be the demo login)', string_agg(u.email, ', ')
  from public.profiles p join auth.users u on u.id = p.id where p.is_protected
union all
-- 3. Clients can neither read nor write is_protected.
select 'is_protected readable / updatable by authenticated',
       has_column_privilege('authenticated', 'public.profiles', 'is_protected', 'select')::text || ' / '
       || has_column_privilege('authenticated', 'public.profiles', 'is_protected', 'update')::text
union all
-- 4. Who may delete their account.
select 'function public.delete_my_account',
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_my_account';
