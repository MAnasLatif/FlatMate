-- Shared inventory: items, ownership and their linked costs (SRS FR-10.5).
begin;

select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.join(code text) returns void language plpgsql as $$
declare
  joiner_claims text := current_setting('request.jwt.claims', true);
  result jsonb := public.join_apartment(code);
  admin uuid;
begin
  perform set_config('role', 'postgres', true);
  select user_id into admin from public.apartment_members
  where apartment_id = (result ->> 'apartment_id')::uuid and role = 'admin' and left_at is null
  order by joined_at limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.approve_join_request((result ->> 'request_id')::uuid);
  perform set_config('request.jwt.claims', joiner_claims, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.y() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.fridge() returns uuid language sql as $$ select pg_temp.v('fridge')::uuid $$;
create function pg_temp.everyone() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
                           jsonb_build_object('user_id', pg_temp.y()))
$$;
create function pg_temp.paid_by(who uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', who, 'amount_minor', amount))
$$;
-- An item's totals as 'purchase:maintenance:count:provisional'.
create function pg_temp.totals(item uuid) returns text language sql as $$
  select purchase_minor || ':' || maintenance_minor || ':' || cost_count || ':' || has_provisional
  from public.get_inventory(pg_temp.flat()) where id = item
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

-- Items ------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('fridge', public.save_inventory_item(
  pg_temp.flat(), '  Fridge ', 'apartment', p_notes => ' Kitchen ', p_request_id => 'bbbbbbbb-0000-0000-0000-000000000001')::text);
select is(
  (select name || ':' || owner_type || ':' || condition || ':' || status || ':' || notes
   from public.inventory_items where id = pg_temp.fridge()),
  'Fridge:apartment:good:in_use:Kitchen', 'a member adds one of the flat''s items, tidied, in use and in good condition');
select is(
  public.save_inventory_item(pg_temp.flat(), 'Fridge', 'apartment',
    p_request_id => 'bbbbbbbb-0000-0000-0000-000000000001')::text,
  pg_temp.v('fridge'), 'a retried add returns the same item');
select is((select count(*)::int from public.inventory_items), 1, 'and adds nothing more');

insert into vals values ('washer', public.save_inventory_item(
  pg_temp.flat(), 'Washing machine', 'member', p_owner_id => pg_temp.y(), p_condition => 'fair')::text);
select is(
  (select owner_type || ':' || (owner_id = pg_temp.y()) from public.inventory_items where id = pg_temp.v('washer')::uuid),
  'member:true', 'an item can be one member''s own');

select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'member') $$,
  '22023', 'invalid_item_owner', 'a member''s item names the member');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'apartment', p_owner_id => pg_temp.a()) $$,
  '22023', 'invalid_item_owner', 'the flat''s item has no single owner');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'member', p_owner_id => pg_temp.o()) $$,
  '22023', 'item_owner_not_member', 'only a member can own an item');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), '  ', 'apartment') $$,
  '22023', 'invalid_item_name', 'an item needs a name');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'apartment', p_status => 'sold') $$,
  '22023', 'invalid_item_status', 'status is in use, needs repair or gone');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'apartment', p_condition => 'broken') $$,
  '22023', 'invalid_item_condition', 'condition is new, good, fair or poor');

-- Changing an item
select public.save_inventory_item(pg_temp.flat(), 'Fridge', 'apartment', pg_temp.fridge(),
  p_condition => 'fair', p_status => 'needs_repair', p_notes => 'Kitchen');
select is(
  (select details ->> 'changed' from public.audit_events
   where entity_type = 'inventory_item' and entity_id = pg_temp.fridge() and action = 'updated'),
  '["condition", "status"]', 'a change records which fields changed');
select public.save_inventory_item(pg_temp.flat(), 'Fridge', 'apartment', pg_temp.fridge(),
  p_condition => 'fair', p_status => 'needs_repair', p_notes => 'Kitchen');
select is(
  (select count(*)::int from public.audit_events where entity_type = 'inventory_item' and action = 'updated'),
  1, 'saving without a change records nothing');

-- Restrictions
select pg_temp.act_as(pg_temp.a());
select public.set_member_can_add_expense(pg_temp.flat(), pg_temp.z(), false);
select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'apartment') $$,
  '42501', 'not_allowed_to_add_expense', 'a member who may not add expenses cannot manage items');
select is((select count(*)::int from public.inventory_items), 2, 'but still sees the inventory');
select pg_temp.act_as(pg_temp.a());
select public.set_member_can_add_expense(pg_temp.flat(), pg_temp.z(), true);

select pg_temp.act_as(pg_temp.o());
select is((select count(*)::int from public.inventory_items), 0, 'an outsider sees no items');
select throws_ok(
  $$ select public.save_inventory_item(pg_temp.flat(), 'Kettle', 'apartment') $$,
  '42501', null, 'and cannot add one');
select throws_ok(
  $$ insert into public.inventory_items (apartment_id, name, owner_type) values (pg_temp.flat(), 'Sofa', 'apartment') $$,
  '42501', null, 'nobody writes the table directly');

-- Costs ------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('bought', public.post_expense(pg_temp.flat(), 'New fridge', 90000, current_date, 'equal',
  pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 90000))::text);
insert into vals values ('repair', public.post_expense(pg_temp.flat(), 'Fridge gas', 6000, current_date, 'equal',
  pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 6000))::text);
insert into vals values ('mistake', public.post_expense(pg_temp.flat(), 'Fridge gas twice', 6000, current_date, 'equal',
  pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 6000))::text);
reset role;
insert into vals select 'ledger_rows', count(*)::text from public.ledger_entries where apartment_id = pg_temp.flat();

select pg_temp.act_as(pg_temp.z());
select public.link_inventory_cost(pg_temp.v('bought')::uuid, pg_temp.fridge(), 'purchase');
select public.link_inventory_cost(pg_temp.v('repair')::uuid, pg_temp.fridge(), 'maintenance');
select public.link_inventory_cost(pg_temp.v('mistake')::uuid, pg_temp.v('washer')::uuid, 'maintenance');
select is(pg_temp.totals(pg_temp.fridge()), '90000:6000:2:true',
  'an item adds up its purchase and maintenance, still provisional');

select public.link_inventory_cost(pg_temp.v('mistake')::uuid, pg_temp.fridge(), 'maintenance');
select is(pg_temp.totals(pg_temp.fridge()) || ',' || pg_temp.totals(pg_temp.v('washer')::uuid),
  '90000:12000:3:true,0:0:0:false', 'linking an expense again moves it to the other item');
select public.link_inventory_cost(pg_temp.v('mistake')::uuid, pg_temp.fridge(), 'maintenance');
select is(
  (select count(*)::int from public.audit_events where entity_type = 'inventory_item' and action = 'cost_linked'),
  4, 'linking it the same way again records nothing');
reset role;
select is(
  (select count(*)::text from public.ledger_entries where apartment_id = pg_temp.flat()),
  pg_temp.v('ledger_rows'), 'linking moves no money: balances come only from the expenses');

select pg_temp.act_as(pg_temp.a());
select public.void_expense(pg_temp.v('mistake')::uuid);
select is(pg_temp.totals(pg_temp.fridge()), '90000:6000:3:true', 'a cancelled expense counts for nothing');
select pg_temp.act_as(pg_temp.z());
select throws_ok(
  format($$ select public.link_inventory_cost(%L, %L, 'purchase') $$, pg_temp.v('mistake'), pg_temp.v('washer')),
  '22023', 'expense_void', 'a cancelled expense cannot be linked');
select throws_ok(
  format($$ select public.link_inventory_cost(%L, %L, 'repair') $$, pg_temp.v('repair'), pg_temp.fridge()),
  '22023', 'invalid_cost_kind', 'a cost is a purchase or maintenance');

select public.unlink_inventory_cost(pg_temp.v('mistake')::uuid);
select is(pg_temp.totals(pg_temp.fridge()), '90000:6000:2:true', 'unlinking takes the expense off the item');
select is(
  (select status from public.expenses where id = pg_temp.v('mistake')::uuid), 'void',
  'and leaves the expense as it was');
select throws_ok(
  format($$ select public.unlink_inventory_cost(%L) $$, pg_temp.v('mistake')),
  'P0002', 'cost_not_linked', 'an expense that is not linked cannot be unlinked');

-- Removing ---------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  format($$ select public.remove_inventory_item(%L) $$, pg_temp.fridge()),
  '42501', 'admin_required', 'only an admin removes an item');
select pg_temp.act_as(pg_temp.a());
select public.remove_inventory_item(pg_temp.fridge());
select is(
  (select count(*)::int from public.inventory_items where id = pg_temp.fridge())
  + (select count(*)::int from public.inventory_costs where item_id = pg_temp.fridge()),
  0, 'an admin removes an item and its links');
select is(
  (select count(*)::int from public.expenses where id in (pg_temp.v('bought')::uuid, pg_temp.v('repair')::uuid)
   and status <> 'void'),
  2, 'its expenses stay');

-- Activity ---------------------------------------------------------------------------------

select is(
  (select string_agg(action || ':' || subject, ',' order by id)
   from public.get_activity(pg_temp.flat(), 'expenses') where entity_type = 'inventory_item'),
  'created:Fridge,created:Washing machine,updated:Fridge,cost_linked:Fridge,cost_linked:Fridge,cost_linked:Washing machine,cost_linked:Fridge,cost_unlinked:Fridge,removed:Fridge',
  'each change is in the timeline under expenses, named even after the item is removed');

-- An owner who leaves keeps their item.
select pg_temp.act_as(pg_temp.y());
select public.leave_apartment(pg_temp.flat());
select pg_temp.act_as(pg_temp.z());
select public.save_inventory_item(pg_temp.flat(), 'Washing machine', 'member', pg_temp.v('washer')::uuid,
  pg_temp.y(), 'fair', 'gone');
select is(
  (select status || ':' || (owner_id = pg_temp.y()) from public.inventory_items where id = pg_temp.v('washer')::uuid),
  'gone:true', 'an item stays its owner''s after they leave, and can be marked gone');
select pg_temp.act_as(pg_temp.y());
select is((select count(*)::int from public.inventory_items), 0, 'a former member no longer sees the inventory');

select * from finish();
rollback;
