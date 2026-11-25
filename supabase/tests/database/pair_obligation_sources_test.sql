-- What two people owe each other lists every debt behind their balance, also
-- those that do not come from an expense (SRS FR-06.2, AC-09).
begin;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@example.test', '{"display_name": "Outsider"}');

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
create function pg_temp.o() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
-- Paid by one person, owed entirely by another: makes "debtor owes payer amount".
-- Dated yesterday, so the expense is older than anything recorded today: in
-- one test transaction every record has the same created_at.
create function pg_temp.debt(debtor uuid, payer uuid, amount bigint, title text) returns uuid language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  created uuid;
begin
  perform pg_temp.act_as(payer);
  created := public.post_expense(pg_temp.flat(), title, amount, current_date - 1, 'fixed',
    jsonb_build_array(jsonb_build_object('user_id', debtor, 'amount_minor', amount)),
    jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount)));
  perform set_config('request.jwt.claims', claims, true);
  return created;
end;
$$;
-- The caller's items with one person, as "direction:source:title:amount:covered".
create function pg_temp.items(counterparty uuid) returns text language sql as $$
  select coalesce(string_agg(
    direction || ':' || source || ':' || title || ':' || amount_minor || ':' || covered_minor, ', '
    order by direction, source, title), '')
  from public.get_my_pair_obligations(pg_temp.flat(), counterparty)
$$;
-- What the items leave unpaid, owed minus owing: must equal the balance.
create function pg_temp.items_net(counterparty uuid) returns bigint language sql as $$
  select coalesce(sum(case when direction = 'owe' then 1 else -1 end * (amount_minor - covered_minor)), 0)::bigint
  from public.get_my_pair_obligations(pg_temp.flat(), counterparty)
  where not is_held
$$;
create function pg_temp.balance(me uuid, counterparty uuid) returns bigint language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  result bigint;
begin
  perform set_config('role', 'postgres', true);
  result := private.pair_payable(pg_temp.flat(), me, counterparty) - private.pair_payable(pg_temp.flat(), counterparty, me);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims, true);
  return result;
end;
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

-- A simplification ------------------------------------------------------------------------

-- Zubair owes Anas Rs 1,000 and Anas owes Yasir Rs 1,000; Zubair pays Yasir instead.
insert into vals values ('lunch', pg_temp.debt(pg_temp.z(), pg_temp.a(), 100000, 'Lunch')::text);
insert into vals values ('fuel', pg_temp.debt(pg_temp.a(), pg_temp.y(), 100000, 'Fuel')::text);
select pg_temp.act_as(pg_temp.z());
insert into vals values ('transfer',
  public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 100000)::text);
select pg_temp.act_as(pg_temp.a());
select public.answer_debt_transfer(pg_temp.v('transfer')::uuid, true);
select pg_temp.act_as(pg_temp.y());
select public.answer_debt_transfer(pg_temp.v('transfer')::uuid, true);

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.items(pg_temp.y()), 'owe:simplification:Debts simplified through Anas:100000:0',
  'the debt a simplification moved to Yasir is listed for Zubair');
select is(
  (select source_id::text || ':' || (expense_id is null)::text
   from public.get_my_pair_obligations(pg_temp.flat(), pg_temp.y())),
  pg_temp.v('transfer') || ':true', 'linked to the simplification, not an expense');
select is(pg_temp.items(pg_temp.a()), 'owe:expense:Lunch:100000:100000',
  'the lunch it moved stays listed, as settled');
select pg_temp.act_as(pg_temp.y());
select is(pg_temp.items(pg_temp.z()), 'owed:simplification:Debts simplified through Anas:100000:0',
  'Yasir sees it as owed to him');

-- A payment towards it covers it like an expense.
select pg_temp.act_as(pg_temp.z());
select public.record_payment(pg_temp.flat(), pg_temp.y(), 40000);
select is(pg_temp.items(pg_temp.y()), 'owe:simplification:Debts simplified through Anas:100000:40000',
  'a payment covers it');

-- A deposit, and undoing it -----------------------------------------------------------------

-- Anas paid the landlord Rs 900, shared equally by the three.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('deposit', public.record_deposit(pg_temp.flat(), 'Flat deposit', 90000, current_date - 1,
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 90000)),
  'equal', jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.y())))::text);
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.items(pg_temp.a()), 'owe:deposit:Flat deposit:30000:0, owe:expense:Lunch:100000:100000',
  'a deposit share is listed under the deposit''s name');
select is(
  (select source_id from public.get_my_pair_obligations(pg_temp.flat(), pg_temp.a()) where source = 'deposit'),
  pg_temp.v('deposit')::uuid, 'linked to the deposit');

select pg_temp.act_as(pg_temp.a());
select public.undo_deposit_action(
  (select id from public.deposit_actions where deposit_id = pg_temp.v('deposit')::uuid and kind = 'recorded'));
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.items(pg_temp.a()),
  'owe:deposit:Flat deposit:30000:0, owe:expense:Lunch:100000:100000, owed:deposit:Flat deposit:30000:0',
  'undoing it shows the reverse, as the ledger records it');

-- A standalone adjustment --------------------------------------------------------------------

select public.record_adjustment(pg_temp.flat(), pg_temp.z(), pg_temp.y(), 5000, 'Broken mug');
-- Made in the same transaction as the simplification, so which of the two
-- the payment covers first is a tie; the total covered is not.
select is(
  (select string_agg(direction || ':' || source || ':' || title || ':' || amount_minor, ', ' order by source)
     || ' covered ' || sum(covered_minor)
   from public.get_my_pair_obligations(pg_temp.flat(), pg_temp.y())),
  'owe:adjustment:Broken mug:5000, owe:simplification:Debts simplified through Anas:100000 covered 40000',
  'an adjustment is listed with its reason');
select is(
  (select source_id from public.get_my_pair_obligations(pg_temp.flat(), pg_temp.y()) where source = 'adjustment'),
  (select id from public.adjustments where reason = 'Broken mug'), 'linked to the adjustment');

-- The items explain the balance ----------------------------------------------------------------

select is(pg_temp.items_net(pg_temp.y()), pg_temp.balance(pg_temp.z(), pg_temp.y()),
  'what Zubair''s items with Yasir leave unpaid is their balance');
select is(pg_temp.items_net(pg_temp.a()), pg_temp.balance(pg_temp.z(), pg_temp.a()),
  'and with Anas');

select pg_temp.act_as(pg_temp.o());
select is(pg_temp.items(pg_temp.y()), '', 'someone outside the flat sees nothing');

select * from finish();
rollback;
