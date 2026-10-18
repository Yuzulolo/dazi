-- Read-only check for migration 20261017225104_posts_hardening.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'table-level grants on posts' as check,
       coalesce(string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type), 'none') as result
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'posts' and grantee in ('anon', 'authenticated')
union all
select 'INSERT/UPDATE columns: authenticated', coalesce(string_agg(privilege_type || ':' || column_name, ', '), 'none')
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'posts' and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE')
union all
select 'embedding readable by authenticated?', has_column_privilege('authenticated', 'public.posts', 'embedding', 'select')::text
union all
select 'policies on posts', string_agg(policyname || ' (' || cmd || ')', ', ' order by cmd)
  from pg_policies
  where schemaname = 'public' and tablename = 'posts'
union all
select 'triggers on posts', string_agg(tgname, ', ' order by tgname)
  from pg_trigger
  where tgrelid = 'public.posts'::regclass and not tgisinternal
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'set_updated_at'), ('private', 'has_contact_details'),
                                   ('private', 'posts_guard'), ('public', 'publish_post'),
                                   ('public', 'update_post'), ('public', 'consume_ai_quota'))
union all
select 'contact detector: phone / email / normal text',
       private.has_contact_details('text me at 0151 2345678')::text || ' / '
       || private.has_contact_details('mail a.b@mail.de')::text || ' / '
       || private.has_contact_details('Berlin 20-25 Oct 2026, Erasmus 2018/2019/2020')::text
union all
select 'consume_ai_quota has site-wide ceiling', (pg_get_functiondef('public.consume_ai_quota(text)'::regprocedure) like '%1000%')::text
union all
select 'posts: total / active', count(*) || ' / ' || count(*) filter (where status = 'active')
  from public.posts;
