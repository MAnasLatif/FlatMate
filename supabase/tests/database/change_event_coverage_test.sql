-- Every change another member, or the same user on another device, can see
-- must send a change event (decision 0007). This test fails when a database
-- function or a table clients write is not covered, so a new feature cannot
-- forget its events. To fix a failure, write an audit_events row in the same
-- transaction, call private.emit_change, or add a trigger that does. Only add
-- to the allow-list below when the change truly needs no event, with the reason.
begin;

select plan(5);

-- Functions in our schemas, with their source.
create temporary view fns as
select p.oid, n.nspname, p.proname, p.prosrc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname in ('private', 'public') and l.lanname in ('plpgsql', 'sql');

-- A function is covered when it records the change or sends an event, or calls
-- a private function that does.
create temporary view covered as
with recursive c(proname) as (
  select proname from fns where prosrc ~* '(public\.audit_events|private\.emit_change\()'
  union
  select f.proname from fns f join c on f.prosrc ~* ('private\.' || c.proname || '\(')
)
select distinct proname from c;

-- Private functions that write to a public table.
create temporary view writers as
select distinct f.proname
from fns f, regexp_matches(f.prosrc, '(?:insert\s+into|update|delete\s+from)\s+public\.\w+', 'gi')
where f.nspname = 'private';

create temporary table allowed (proname text primary key, kind text not null, reason text not null);
insert into allowed values
  ('post_charges', 'helper', 'writes ledger entries for its callers, which record the change'),
  ('reverse_open_charges', 'helper', 'reverses ledger entries for its callers, which record the change'),
  ('release_dispute_hold', 'helper', 'releases a dispute hold for its callers, which record it'),
  ('record_exit', 'helper', 'records an exit balance for leave and remove, which record the change'),
  ('write_deposit_adjustment', 'helper', 'posts a deposit action''s debts for its callers, which record the change'),
  ('begin_deposit_action', 'helper', 'starts a deposit action for its callers, which record the change'),
  ('note_room_split', 'helper', 'notes a room split on a charge its callers just posted and recorded'),
  ('handle_new_user', 'standalone', 'creates the profile at sign-up, before anyone else can see it'),
  ('add_default_categories', 'standalone', 'runs as an apartment is created, which create_apartment records'),
  ('register_push_token', 'standalone', 'stores a device''s push token, which no one is ever shown'),
  ('unregister_push_token', 'standalone', 'removes a device''s push token, which no one is ever shown'),
  ('claim_pushes', 'standalone', 'updates push delivery columns, which clients cannot read'),
  ('report_pushes', 'standalone', 'updates push delivery columns and drops dead tokens, neither visible to clients'),
  ('claim_push_receipts', 'standalone', 'claims and tidies push tickets, which clients cannot read'),
  ('report_push_receipts', 'standalone', 'records push receipts and drops dead tokens, neither visible to clients'),
  ('ensure_open_period', 'standalone',
   'opens the current settlement period on demand; it follows from the settlement day, so nobody learns anything new');

select is_empty(
  $$ select proname from writers
     except select proname from covered
     except select proname from allowed $$,
  'every function that writes data records the change or sends an event'
);

select is_empty(
  $$ select f.proname || ' calls ' || a.proname
     from allowed a
     join fns f on f.prosrc ~* ('private\.' || a.proname || '\(') and f.proname <> a.proname
     where a.kind = 'helper'
       and f.proname not in (select proname from covered)
       and f.proname not in (select proname from allowed) $$,
  'every caller of an allowed helper records the change'
);

select is_empty(
  $$ select proname from allowed except select proname from writers $$,
  'the allow-list names only functions that still write data'
);

select is_empty(
  $$ select proname from allowed where proname in (select proname from covered) $$,
  'the allow-list names only functions that are not already covered'
);

-- Tables that client roles write directly must send events from a trigger.
select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (has_table_privilege('authenticated', c.oid, 'INSERT')
            or has_table_privilege('authenticated', c.oid, 'DELETE')
            or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
            or has_any_column_privilege('authenticated', c.oid, 'INSERT'))
       and not exists (
         select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
         where t.tgrelid = c.oid and not t.tgisinternal and p.prosrc ~* 'private\.emit_change\('
       ) $$,
  'every table clients write directly sends events from a trigger'
);

select * from finish();

rollback;
