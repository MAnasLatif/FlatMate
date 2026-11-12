-- Every table in the public schema is reachable through the Data API, so
-- every one of them must have row-level security enabled. This guards each
-- new table from the first migration onward.
begin;

select plan(1);

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

select * from finish();

rollback;
