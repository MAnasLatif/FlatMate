-- Debt simplification: suggestions, proposals, everyone's yes, and the
-- ledger entries it writes (SRS FR-06.5).
begin;

select plan(36);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('44444444-4444-4444-4444-444444444444', 'wali@example.test', '{"display_name": "Wali"}'),
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
create function pg_temp.w() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
-- What one person owes another now, as a payment would see it.
create function pg_temp.owes(debtor uuid, creditor uuid) returns bigint language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  result bigint;
begin
  perform set_config('role', 'postgres', true);
  result := private.pair_payable(pg_temp.flat(), debtor, creditor);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims, true);
  return result;
end;
$$;
-- Paid by one person, owed entirely by another: makes "debtor owes payer amount".
create function pg_temp.debt(debtor uuid, payer uuid, amount bigint, title text) returns uuid language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  created uuid;
begin
  perform pg_temp.act_as(payer);
  created := public.post_expense(pg_temp.flat(), title, amount, current_date, 'fixed',
    jsonb_build_array(jsonb_build_object('user_id', debtor, 'amount_minor', amount)),
    jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount)));
  perform set_config('request.jwt.claims', claims, true);
  return created;
end;
$$;
-- Everyone's net with the group, as 'Anas:0,…' (positive: owed to them).
create function pg_temp.nets() returns text language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  result text;
begin
  perform set_config('role', 'postgres', true);
  select string_agg(n.name || ':' || (
    (select coalesce(sum(private.pair_payable(pg_temp.flat(), o.id, n.id)), 0)
     from (values (pg_temp.a()), (pg_temp.z()), (pg_temp.y()), (pg_temp.w())) o (id) where o.id <> n.id)
    - (select coalesce(sum(private.pair_payable(pg_temp.flat(), n.id, o.id)), 0)
       from (values (pg_temp.a()), (pg_temp.z()), (pg_temp.y()), (pg_temp.w())) o (id) where o.id <> n.id)
  ), ',' order by n.name)
  into result
  from (values (pg_temp.a(), 'Anas'), (pg_temp.z(), 'Zubair'), (pg_temp.y(), 'Yasir'), (pg_temp.w(), 'Wali')) n (id, name);
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
select pg_temp.act_as(pg_temp.w());
select pg_temp.join(pg_temp.v('code'));

-- Zubair owes Anas Rs 1,000, and Anas owes Yasir Rs 1,000.
insert into vals values ('lunch', pg_temp.debt(pg_temp.z(), pg_temp.a(), 100000, 'Lunch')::text);
insert into vals values ('fuel', pg_temp.debt(pg_temp.a(), pg_temp.y(), 100000, 'Fuel')::text);
insert into vals values ('nets_before', pg_temp.nets());

-- Suggestions ------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(
  (select string_agg((debtor_id = pg_temp.z())::text || (middle_id = pg_temp.a())::text
          || (creditor_id = pg_temp.y())::text || ':' || amount_minor, ',')
   from public.get_debt_transfer_suggestions(pg_temp.flat())),
  'truetruetrue:100000', 'Zubair is shown he can pay Yasir directly instead of through Anas');
select pg_temp.act_as(pg_temp.w());
select is((select count(*)::int from public.get_debt_transfer_suggestions(pg_temp.flat())), 0,
  'someone not in the chain sees nothing about it');
select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select * from public.get_debt_transfer_suggestions(pg_temp.flat()) $$,
  '42501', 'not_member', 'outsiders get no suggestions');

-- Proposing --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 100001) $$,
  '22023', 'transfer_exceeds_debt', 'no more than either debt can move');
select throws_ok(
  $$ select public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.z(), 100) $$,
  '22023', 'transfer_needs_three_people', 'it takes three different people');
select pg_temp.act_as(pg_temp.w());
select throws_ok(
  $$ select public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 100) $$,
  '42501', 'not_in_transfer', 'only one of the three can propose it');

select pg_temp.act_as(pg_temp.z());
insert into vals values ('first', public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(),
  100000, 'eeeeeeee-0000-0000-0000-000000000001')::text);
select is(
  public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 100000,
    'eeeeeeee-0000-0000-0000-000000000001')::text,
  pg_temp.v('first'), 'a retried proposal returns the first one');
select throws_ok(
  $$ select public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 100000) $$,
  '22023', 'transfer_already_proposed', 'one open proposal per chain');
select is(
  (select state || ':' || (select string_agg(accepted::text, ',') from public.debt_transfer_answers
                           where transfer_id = t.id)
   from public.debt_transfers t where t.id = pg_temp.v('first')::uuid),
  'proposed:true', 'proposing it is the proposer''s yes');
select is((select count(*)::int from public.get_debt_transfer_suggestions(pg_temp.flat())), 0,
  'a proposed step is no longer suggested');
select is(pg_temp.owes(pg_temp.z(), pg_temp.a()), 100000::bigint, 'nothing moves before everyone agrees');

reset role;
select is(
  (select string_agg(type, ',' order by type) from public.notifications
   where record_type = 'debt_transfer' and record_id = pg_temp.v('first')::uuid and user_id in (pg_temp.a(), pg_temp.y())),
  'debt_transfer.proposed,debt_transfer.proposed', 'the other two are asked');
select is(private.notification_category('debt_transfer.proposed'), 'payments', 'under the Payments push group');
select isnt(private.push_text('debt_transfer.proposed'), 'Something changed in FlatMate.', 'with its own lock-screen text');

-- Answering --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.w());
select is((select count(*)::int from public.debt_transfers), 0, 'someone not in it cannot see it');
select throws_ok(
  format($$ select public.answer_debt_transfer(%L, true) $$, pg_temp.v('first')),
  'P0002', 'transfer_not_found', 'or answer it');
select pg_temp.act_as(pg_temp.a());
select is((select count(*)::int from public.debt_transfers), 1, 'an admin can see it');

select pg_temp.act_as(pg_temp.y());
select is(public.answer_debt_transfer(pg_temp.v('first')::uuid, true), 'proposed', 'it waits until all three agree');
select pg_temp.act_as(pg_temp.a());
select is(public.answer_debt_transfer(pg_temp.v('first')::uuid, true), 'applied', 'the last yes applies it');
select is(public.answer_debt_transfer(pg_temp.v('first')::uuid, true), 'applied', 'answering again changes nothing');

select is(pg_temp.owes(pg_temp.z(), pg_temp.a()) || ',' || pg_temp.owes(pg_temp.a(), pg_temp.y()) || ','
          || pg_temp.owes(pg_temp.z(), pg_temp.y()),
  '0,0,100000', 'Zubair now owes Yasir directly; Anas owes and is owed nothing');
select is(pg_temp.nets(), pg_temp.v('nets_before'), 'nobody''s net with the group changes');
reset role;
select is(
  (select string_agg(kind || ':' || amount_minor, ',' order by kind) from public.ledger_entries
   where debt_transfer_id = pg_temp.v('first')::uuid
      or adjustment_id in (select id from public.adjustments where debt_transfer_id = pg_temp.v('first')::uuid)),
  'adjustment:100000,transfer:100000,transfer:100000', 'it is written as new entries');
select is(
  (select count(*)::int from public.ledger_entries where kind = 'charge' and expense_id in
    (pg_temp.v('lunch')::uuid, pg_temp.v('fuel')::uuid)),
  2, 'the expenses behind it stay as they were');
select pg_temp.act_as(pg_temp.z());
select is(
  (select covered_minor from public.get_my_pair_obligations(pg_temp.flat(), pg_temp.a())
   where expense_id = pg_temp.v('lunch')::uuid),
  100000::bigint, 'Zubair''s lunch with Anas counts as settled');

-- Declining, running out of time, and debts that change -------------------------------------

-- Yasir owes Wali Rs 500; Zubair owes Yasir Rs 1,000.
insert into vals values ('rent', pg_temp.debt(pg_temp.y(), pg_temp.w(), 50000, 'Rent share')::text);
select pg_temp.act_as(pg_temp.w());
insert into vals values ('second', public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.y(), pg_temp.w(), 50000)::text);
select pg_temp.act_as(pg_temp.z());
select is(public.answer_debt_transfer(pg_temp.v('second')::uuid, false), 'declined', 'one no closes it');
select is(pg_temp.owes(pg_temp.z(), pg_temp.w()), 0::bigint, 'and nothing moves');

select pg_temp.act_as(pg_temp.y());
insert into vals values ('third', public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.y(), pg_temp.w(), 50000)::text);
reset role;
update public.debt_transfers set expires_at = now() - interval '1 minute' where id = pg_temp.v('third')::uuid;
select pg_temp.act_as(pg_temp.z());
select is(public.answer_debt_transfer(pg_temp.v('third')::uuid, true), 'lapsed', 'after 7 days it lapses');

select pg_temp.act_as(pg_temp.y());
insert into vals values ('fourth', public.propose_debt_transfer(pg_temp.flat(), pg_temp.z(), pg_temp.y(), pg_temp.w(), 50000)::text);
select is((select state from public.debt_transfers where id = pg_temp.v('fourth')::uuid), 'proposed',
  'a lapsed one makes way for a new proposal');
-- Yasir pays Wali before the others answer.
select public.record_payment(pg_temp.flat(), pg_temp.w(), 50000);
select pg_temp.act_as(pg_temp.z());
select is(public.answer_debt_transfer(pg_temp.v('fourth')::uuid, true), 'proposed', 'Zubair agrees');
select pg_temp.act_as(pg_temp.w());
select is(public.answer_debt_transfer(pg_temp.v('fourth')::uuid, true), 'lapsed',
  'when the debts no longer cover it, it lapses instead of applying');
select is(pg_temp.owes(pg_temp.z(), pg_temp.w()), 0::bigint, 'so nothing moves');

-- History ----------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(
  (select string_agg(action, ',' order by id) from public.get_activity(pg_temp.flat(), 'payments')
   where entity_type = 'debt_transfer' and entity_id = pg_temp.v('first')::uuid),
  'proposed,accepted,applied', 'each step is in the timeline under payments');
select is(
  (select amount_minor::text || (person_id = pg_temp.z())::text || (counterparty_id = pg_temp.y())::text
   from public.get_activity(pg_temp.flat(), 'payments')
   where entity_type = 'debt_transfer' and entity_id = pg_temp.v('first')::uuid and action = 'applied'),
  '100000truetrue', 'naming the amount, who pays and who is paid');
select pg_temp.act_as(pg_temp.w());
select is(
  (select count(*)::int from public.get_activity(pg_temp.flat()) where entity_id = pg_temp.v('first')::uuid),
  0, 'someone not in it does not see it in the timeline');

select throws_ok(
  $$ insert into public.debt_transfers (apartment_id, debtor_id, middle_id, creditor_id, amount_minor, proposed_by, expires_at)
     values (pg_temp.flat(), pg_temp.z(), pg_temp.a(), pg_temp.y(), 1, pg_temp.w(), now()) $$,
  '42501', null, 'nobody writes the table directly');

select * from finish();
rollback;
