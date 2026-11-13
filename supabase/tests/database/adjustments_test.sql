-- Locked periods and adjustments (SRS FR-08.6, FR-05.6, FR-07.6, decision record 0006).
begin;

select plan(16);

-- The ids sort Anas, Zubair, Ajmal.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;
create function pg_temp.two() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()))
$$;
create function pg_temp.zubair_owes_anas() returns bigint language sql as $$
  select coalesce((select final_minor + provisional_minor from public.get_my_balances(pg_temp.v('flat'))
                   where counterparty_id = pg_temp.a()), 0)::bigint
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Anas paid Rs 200 for cleaning in August, shared with Zubair, and an electricity bill nobody paid yet.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(pg_temp.v('flat'), 'Cleaning', 20000, current_date, 'equal',
  pg_temp.two(), jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)))::text);
insert into vals values ('bill', public.post_expense(pg_temp.v('flat'), 'Electricity', 6000, current_date, 'equal',
  pg_temp.two(), '[]'::jsonb)::text);
insert into vals values ('snacks', public.post_expense(pg_temp.v('flat'), 'Snacks', 1000, current_date, 'equal',
  pg_temp.two(), jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 1000)))::text);
reset role;
update public.expenses set expense_date = '2026-08-15', status = 'final', finalized_at = now()
where id in (pg_temp.v('cleaning'), pg_temp.v('bill'));
update public.settlement_periods set starts_on = '2026-08-01', ends_on = '2026-08-31' where apartment_id = pg_temp.v('flat');
select private.close_due_periods();

-- Locks -------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.edit_expense(pg_temp.v('cleaning'), 1, 'Cleaning', null, null, '2026-08-15', null,
    30000, 'equal', pg_temp.two(), jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 30000))) $$,
  'P0001', 'period_closed', 'a final expense in a closed period cannot be edited');
select throws_ok($$ select public.void_expense(pg_temp.v('cleaning')) $$, 'P0001', 'period_closed', 'or voided');
select throws_ok($$ select public.post_expense(pg_temp.v('flat'), 'Late', 1000, '2026-08-20', 'equal', pg_temp.two(),
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 1000))) $$,
  'P0001', 'period_closed', 'nothing can be posted into a closed period');
select throws_ok($$ select public.edit_expense(pg_temp.v('snacks'), 1, 'Snacks', null, null, '2026-08-20', null,
    1000, 'equal', pg_temp.two(), jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 1000))) $$,
  'P0001', 'period_closed', 'or moved into one by an edit');
select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.record_bill_payment(pg_temp.v('bill'),
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 6000))) $$,
  'a bill from a closed period can still be paid, since it counted nothing when the period closed');

-- A late dispute on a locked expense -----------------------------------------------------------

select is(pg_temp.zubair_owes_anas(), 10500::bigint - 3000, 'Zubair owes Anas Rs 100 for cleaning and Rs 5 for snacks, less Rs 30 for the bill');
insert into vals values ('late', public.raise_dispute(pg_temp.v('cleaning'), 'decline', 'I was away all August')::text);
select pg_temp.act_as(pg_temp.a());
select lives_ok($$ select public.respond_to_dispute(pg_temp.v('late'), true, 'Fair, you were away') $$,
  'Anas accepts the late dispute');
select is(
  (select revision || '/' || status from public.expenses where id = pg_temp.v('cleaning')),
  '1/final',
  'the closed expense keeps its revision and stays final'
);
select is(
  (select left(debtor_id::text, 1) || '>' || left(creditor_id::text, 1) || ':' || amount_minor
   from public.adjustments where dispute_id = pg_temp.v('late')),
  '1>2:10000',
  'the difference is an adjustment: Anas owes Zubair Rs 100 more, which cancels Zubair''s share'
);
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.zubair_owes_anas(), 500::bigint - 3000, 'so Zubair no longer owes anything for cleaning');

-- Who may adjust ----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.record_adjustment(pg_temp.v('flat'), pg_temp.z(), pg_temp.a(), 500, 'You owe me more') $$,
  '42501', 'not_allowed_to_adjust', 'nobody can add to someone else''s debt on their own');
select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.record_adjustment(pg_temp.v('flat'), pg_temp.z(), pg_temp.a(), 2500, 'I forgot the water bottles') $$,
  'the person whose debt goes up can record it');
reset role;
update public.apartment_members set role = 'admin' where apartment_id = pg_temp.v('flat') and user_id = pg_temp.j();
select pg_temp.act_as(pg_temp.j());
select lives_ok($$ select public.record_adjustment(pg_temp.v('flat'), pg_temp.a(), pg_temp.z(), 100, 'Admin decision on the bottles') $$,
  'an admin who is party to neither side can decide one');

-- A late objection to a final payment -----------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.v('flat'), pg_temp.a(), 100)::text);
reset role;
update public.payments set status = 'final', finalized_at = now() where id = pg_temp.v('payment');
select pg_temp.act_as(pg_temp.a());
insert into vals values ('objection', public.decline_payment(pg_temp.v('payment'), 'Found it was a refund')::text);
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.record_adjustment(pg_temp.v('flat'), pg_temp.a(), pg_temp.z(), 100, 'Wrong way', null, pg_temp.v('objection')) $$,
  '42501', 'not_allowed_to_adjust', 'the payer cannot resolve it by changing what Anas owes');
select lives_ok($$ select public.record_adjustment(pg_temp.v('flat'), pg_temp.z(), pg_temp.a(), 100, 'It never arrived', null, pg_temp.v('objection')) $$,
  'the payer resolves the late case by taking the amount back on');
select is(
  (select state || '/' || resolution from public.payment_disputes where id = pg_temp.v('objection')),
  'resolved/adjusted',
  'which closes the case with the payment left final'
);

select * from finish();

rollback;
