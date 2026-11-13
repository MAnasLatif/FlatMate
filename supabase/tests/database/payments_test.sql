-- Recording payments (SRS FR-07.3, FR-07.4, FR-07.7, AC-07, AC-09).
begin;

select plan(22);

-- The ids sort Anas, Zubair, Ajmal.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.balance_with(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select final_minor || '/' || provisional_minor || '/' || disputed_minor
     from public.get_my_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;
create function pg_temp.obligations(counterparty uuid) returns text language sql as $$
  select coalesce(string_agg(title || ':' || direction || ':' || amount_minor || '/' || covered_minor
    || case when is_held then ':held' else '' end, ' ' order by direction, expense_date, title), '')
  from public.get_my_pair_obligations(pg_temp.v('flat'), counterparty)
$$;
create function pg_temp.pay(recipient uuid, amount bigint, request uuid default null) returns uuid language sql as $$
  select public.record_payment(pg_temp.v('flat'), recipient, amount, null, 'TXN-1', null, request)
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Anas pays Rs 200 for cleaning two days ago and Rs 100 for groceries today,
-- each split with Zubair: Zubair owes him 100.00 and then 50.00.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(
  pg_temp.v('flat'), 'Cleaning', 20000, current_date - 2, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)))::text);
insert into vals values ('groceries', public.post_expense(
  pg_temp.v('flat'), 'Groceries', 10000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 10000)))::text);

-- Recording -------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.balance_with(pg_temp.a()), '0/15000/0', 'Zubair owes Anas Rs 150');
insert into vals values ('first', pg_temp.pay(pg_temp.a(), 12000, '99999999-9999-9999-9999-999999999999')::text);
select is(pg_temp.balance_with(pg_temp.a()), '0/3000/0',
  'a partial payment of Rs 120 lowers what he owes at once, provisionally (AC-07)');
select is(
  pg_temp.pay(pg_temp.a(), 12000, '99999999-9999-9999-9999-999999999999'),
  pg_temp.v('first'),
  'retrying the same request returns the same payment (FR-07.7)'
);
select is((select count(*)::int from public.payments), 1, 'and records it once');
select is(
  (select status || '/' || currency || '/' || reference from public.payments where id = pg_temp.v('first')),
  'provisional/PKR/TXN-1',
  'the payment is provisional, in the apartment currency, with its reference'
);
select is(
  (select kind || ':' || left(debtor_id::text, 1) || '>' || left(creditor_id::text, 1) || ':' || amount_minor
   from public.ledger_entries where payment_id = pg_temp.v('first')),
  'payment:2>1:12000',
  'it is one payment entry from Zubair to Anas'
);
select ok(
  (select (finalize_after at time zone 'Asia/Karachi')::time = '00:00' and finalize_after > now() + interval '7 days'
   from public.payments where id = pg_temp.v('first')),
  'the recipient has 7 days from recording to object, until local midnight (section 12 item 3)'
);

-- Allocation ------------------------------------------------------------------------------

select is(pg_temp.obligations(pg_temp.a()), 'Cleaning:owe:10000/10000 Groceries:owe:5000/2000',
  'the payment covers the oldest expense first, then part of the next (AC-09)');
select pg_temp.act_as(pg_temp.a());
select is(pg_temp.obligations(pg_temp.z()), 'Cleaning:owed:10000/10000 Groceries:owed:5000/2000',
  'Anas sees the same from his side');
select is(pg_temp.balance_with(pg_temp.z()), '0/-3000/0', 'and is owed the Rs 30 left');

-- Limits ----------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select pg_temp.pay(pg_temp.a(), 3001) $$, '22023', 'payment_exceeds_debt',
  'nobody can pay more than they owe');
select throws_ok($$ select pg_temp.pay(pg_temp.z(), 100) $$, '22023', 'cannot_pay_yourself', 'or pay themselves');
select throws_ok($$ select pg_temp.pay(pg_temp.o(), 100) $$, '22023', 'recipient_not_member',
  'or someone outside the apartment');
select throws_ok($$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 100, now() + interval '1 day') $$,
  '22023', 'paid_at_in_future', 'a payment cannot be dated in the future');
select pg_temp.act_as(pg_temp.j());
select throws_ok($$ select pg_temp.pay(pg_temp.a(), 100) $$, '22023', 'payment_exceeds_debt',
  'Ajmal owes Anas nothing, so he cannot pay him');
select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select pg_temp.pay(pg_temp.a(), 100) $$, '42501', 'not_member',
  'someone outside the apartment cannot record payments in it');

-- Held obligations and payments that do not count ---------------------------------------------

reset role;
update public.expenses set status = 'disputed' where id = pg_temp.v('groceries');
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.obligations(pg_temp.a()), 'Cleaning:owe:10000/10000 Groceries:owe:5000/0:held',
  'payments never cover an obligation held by a dispute');
select throws_ok($$ select pg_temp.pay(pg_temp.a(), 1) $$, '22023', 'payment_exceeds_debt',
  'and a held amount cannot be paid until the dispute ends');
reset role;
update public.expenses set status = 'provisional' where id = pg_temp.v('groceries');
update public.payments set status = 'void' where id = pg_temp.v('first');
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.balance_with(pg_temp.a()), '0/15000/0', 'a void payment no longer counts as paid');

-- Who can see a payment ---------------------------------------------------------------------

select pg_temp.act_as(pg_temp.j());
select is_empty($$ select 1 from public.payments $$, 'a member who is not part of a payment cannot see it');
select is_empty($$ select 1 from public.ledger_entries where kind = 'payment' $$, 'or its ledger entry');
select pg_temp.act_as(pg_temp.a());
select is((select count(*)::int from public.payments), 1, 'the recipient can');

select * from finish();

rollback;
