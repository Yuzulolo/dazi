-- Read-only check for migration 20261017160440_posts_ai.sql.
-- Paste into the Supabase SQL Editor and Run. Changes nothing.

select 'extension vector' as check, coalesce((select extversion || ' in schema ' || n.nspname
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'), 'MISSING') as result
union all
select 'posts columns', string_agg(column_name || ':' || udt_name, ', ' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'posts'
union all
select 'posts RLS enabled', relrowsecurity::text
  from pg_class where oid = 'public.posts'::regclass
union all
select 'policy: ' || policyname, cmd || ' to ' || array_to_string(roles, ',')
  from pg_policies
  where schemaname = 'public' and tablename = 'posts'
union all
select 'table-level grants on posts', coalesce(string_agg(grantee || ':' || privilege_type, ', '), 'none')
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'posts' and grantee in ('anon', 'authenticated')
union all
select 'SELECT columns: authenticated', string_agg(column_name, ', ' order by column_name)
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'posts' and grantee = 'authenticated' and privilege_type = 'SELECT'
union all
select 'embedding readable by authenticated?', has_column_privilege('authenticated', 'public.posts', 'embedding', 'select')::text
union all
select 'any privilege for anon on posts?', (has_table_privilege('anon', 'public.posts', 'select')
         or has_table_privilege('anon', 'public.posts', 'insert')
         or has_column_privilege('anon', 'public.posts', 'city', 'select'))::text
union all
select 'index: ' || indexname, 'exists'
  from pg_indexes
  where schemaname = 'public' and tablename = 'posts' and indexname like 'posts_%'
union all
select 'function ' || n.nspname || '.' || p.proname,
       'definer=' || p.prosecdef
       || ', anon=' || has_function_privilege('anon', p.oid, 'execute')
       || ', authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (('private', 'is_onboarded'), ('private', 'set_updated_at'),
                                   ('public', 'publish_post'), ('public', 'consume_ai_quota'))
union all
select 'private.ai_calls: RLS / any client grant', relrowsecurity::text || ' / '
       || (has_table_privilege('anon', 'private.ai_calls', 'select')
           or has_table_privilege('authenticated', 'private.ai_calls', 'select'))::text
  from pg_class where oid = 'private.ai_calls'::regclass
union all
select 'posts: total / active', count(*) || ' / ' || count(*) filter (where status = 'active')
  from public.posts;
