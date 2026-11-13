-- Every table in the public schema is reachable through the Data API, so
-- every one of them must have row-level security enabled. This guards each
-- new table from the first migration onward.
begin;

select plan(2);

select is_empty(
  $$
    select format('%I.%I', n.nspname, c.relname)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  $$,
  'every table in the public schema has row-level security enabled'
);

-- Postgres lets everyone execute a new function unless it is revoked, which is
-- easy to forget. Nothing in the private schema may be callable without
-- signing in.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'no function in the private schema can be executed by signed-out requests'
);

select * from finish();

rollback;
