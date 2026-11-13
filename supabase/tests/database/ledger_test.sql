-- Posting expenses and the balances they create (SRS 5.1, AC-02, AC-03, AC-04).
begin;

select plan(32);

-- The ids sort Anas, Zubair, Ajmal, which decides who gets leftover units.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}'),
  ('55555555-5555-5555-5555-555555555555', 'restricted@example.test', '{"display_name": "Restricted"}');

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
create function pg_temp.r() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.everyone() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a()),
    jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.j()))
$$;
create function pg_temp.paid_by(payer uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount))
$$;
create function pg_temp.entries(expense uuid) returns text language sql as $$
  select coalesce(string_agg(left(debtor_id::text, 1) || '>' || left(creditor_id::text, 1) || ':' || amount_minor, ' '
    order by debtor_id, creditor_id), '')
  from public.ledger_entries where expense_id = expense
$$;
create function pg_temp.balance_with(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select final_minor || '/' || provisional_minor || '/' || disputed_minor
     from public.get_my_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;

-- An apartment with Anas (admin), Zubair, Ajmal, and a member who may not add expenses.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.r());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.a());
select public.set_member_can_add_expense(pg_temp.v('flat'), pg_temp.r(), false);

-- SRS 5.1: Anas pays Rs 200 cleaning, split equally ---------------------------------------

insert into vals values ('cleaning', public.post_expense(
  pg_temp.v('flat'), 'Cleaning', 20000, current_date, 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 20000)
)::text);

select is(
  (select string_agg(amount_minor::text, '/' order by user_id) from public.expense_current_splits
   where expense_id = pg_temp.v('cleaning')),
  '6667/6667/6666',
  'Rs 200 is shared as 66.67, 66.67, 66.66'
);

select is(
  pg_temp.entries(pg_temp.v('cleaning')),
  '2>1:6667 3>1:6666',
  'Zubair and Ajmal owe Anas their shares'
);

select results_eq(
  $$ select status, paid_status, currency, revision from public.expenses where id = pg_temp.v('cleaning') $$,
  $$ values ('provisional'::text, 'paid'::text, 'PKR'::text, 1) $$,
  'a new expense is provisional, paid, in the apartment currency, at revision 1'
);

select ok(
  (select finalize_after between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
   from public.expenses where id = pg_temp.v('cleaning')),
  'it becomes final after the apartment''s 7-day objection window'
);

-- Ajmal pays Rs 1,000 for a shared item ----------------------------------------------------

select pg_temp.act_as(pg_temp.j());
insert into vals values ('item', public.post_expense(
  pg_temp.v('flat'), 'Shared item', 100000, current_date, 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.j(), 100000)
)::text);

select is(
  pg_temp.entries(pg_temp.v('item')),
  '1>3:33334 2>3:33333',
  'Anas owes Ajmal 333.34 and Zubair owes Ajmal 333.33'
);

-- Balances (FR-06.1, FR-06.2) ----------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());

select is(pg_temp.balance_with(pg_temp.z()), '0/-6667/0', 'Anas sees Zubair owe him 66.67, provisionally');
select is(
  pg_temp.balance_with(pg_temp.j()),
  '0/26668/0',
  'Anas and Ajmal net off: Anas owes 333.34 less 66.66, so 266.68 (SRS 5.1)'
);

select pg_temp.act_as(pg_temp.z());

select is(pg_temp.balance_with(pg_temp.a()), '0/6667/0', 'Zubair sees he owes Anas 66.67');
select is(pg_temp.balance_with(pg_temp.j()), '0/33333/0', 'Zubair''s debt to Ajmal is shown separately (SRS 5.1)');

-- 50% / 25% / 25% (AC-03) ----------------------------------------------------------------------

insert into vals values ('percent', public.post_expense(
  pg_temp.v('flat'), 'Groceries', 100000, current_date, 'percentage',
  jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 2500)),
  pg_temp.paid_by(pg_temp.z(), 100000)
)::text);

select is(
  (select string_agg(amount_minor || '@' || basis_points, ' ' order by user_id) from public.expense_current_splits
   where expense_id = pg_temp.v('percent')),
  '50000@5000 25000@2500 25000@2500',
  'a 50/25/25 split is exact and keeps the percentages asked for'
);

-- Several payers (AC-04) -----------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('shared_pay', public.post_expense(
  pg_temp.v('flat'), 'Dinner', 30000, current_date, 'equal', pg_temp.everyone(),
  jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000),
    jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 10000))
)::text);

select is(
  pg_temp.entries(pg_temp.v('shared_pay')),
  '3>1:10000',
  'with two payers, each covers their own share and Ajmal owes Anas the rest'
);

-- Who may post (AC-02) --------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.r());
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.r(), 1000)),
  '42501', 'not_allowed_to_add_expense',
  'a member who may not add expenses is refused (AC-02)'
);
select throws_ok(
  format('insert into public.expenses (apartment_id, title, amount_minor, currency, expense_date, paid_status, finalize_after, created_by) values (%L, %L, 1000, %L, current_date, %L, now(), %L)',
    pg_temp.v('flat'), 'Snacks', 'PKR', 'paid', pg_temp.r()),
  '42501', null,
  'nor can they insert an expense directly (AC-02)'
);

select pg_temp.act_as(pg_temp.o());
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.o(), 1000)),
  '42501', 'not_allowed_to_add_expense',
  'someone outside the apartment is refused'
);

-- Validation -------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());

select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal',
    pg_temp.everyone() || jsonb_build_array(jsonb_build_object('user_id', pg_temp.o())),
    pg_temp.paid_by(pg_temp.a(), 1000)),
  '22023', 'participant_not_member',
  'everyone sharing an expense must be a current member'
);
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.o(), 1000)),
  '22023', 'payer_not_member',
  'every payer must be a current member'
);
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 999)),
  '22023', 'payers_must_match_total',
  'payers must cover the whole amount'
);
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'percentage',
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 9000)),
    pg_temp.paid_by(pg_temp.a(), 1000)),
  '22023', 'percentages_must_total_100',
  'percentages must add up to 100'
);
select throws_ok(
  format('select public.post_expense(%L, %L, 1000, current_date, %L, %L, %L, %L)',
    pg_temp.v('flat'), 'Snacks', 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 1000),
    gen_random_uuid()),
  '22023', 'invalid_category',
  'the category must belong to the apartment'
);

-- Retries ------------------------------------------------------------------------------------------

insert into vals values ('request', gen_random_uuid()::text);
insert into vals values ('first', public.post_expense(
  pg_temp.v('flat'), 'Internet', 6000, current_date, 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 6000),
  p_client_request_id => pg_temp.v('request'))::text);
insert into vals values ('second', public.post_expense(
  pg_temp.v('flat'), 'Internet', 6000, current_date, 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 6000),
  p_client_request_id => pg_temp.v('request'))::text);

select is(pg_temp.v('second'), pg_temp.v('first'), 'a retried request returns the expense it already created');
select is(
  (select count(*)::int from public.expenses where client_request_id = pg_temp.v('request')),
  1,
  'and creates nothing new'
);

-- Unpaid bills (SRS 5.2, section 12 item 5) ----------------------------------------------------------

insert into vals values ('bill', public.post_expense(
  pg_temp.v('flat'), 'Electricity', 9000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
  p_due_date => current_date + 10)::text);

select is(
  (select paid_status from public.expenses where id = pg_temp.v('bill')) || ' ' || pg_temp.entries(pg_temp.v('bill')),
  'unpaid ',
  'an unpaid bill creates no debts'
);

select pg_temp.act_as(pg_temp.z());
select public.record_bill_payment(pg_temp.v('bill'), pg_temp.paid_by(pg_temp.z(), 9000));

select is(
  pg_temp.entries(pg_temp.v('bill')),
  '1>2:3000 3>2:3000',
  'once Zubair pays the bill, the others owe him their shares'
);
select results_eq(
  $$ select paid_status, revision from public.expenses where id = pg_temp.v('bill') $$,
  $$ values ('paid'::text, 2) $$,
  'paying the bill records a second revision'
);
select throws_ok(
  format('select public.record_bill_payment(%L, %L)', pg_temp.v('bill'), pg_temp.paid_by(pg_temp.z(), 9000)),
  'P0001', 'expense_not_unpaid',
  'a bill cannot be paid twice'
);

-- History cannot be changed --------------------------------------------------------------------------

reset role;

select throws_ok(
  $$ update public.ledger_entries set amount_minor = 1 $$,
  'P0001', 'immutable_record',
  'ledger entries cannot be changed, even by the database owner'
);
select throws_ok(
  $$ delete from public.expense_splits $$,
  'P0001', 'immutable_record',
  'splits cannot be deleted'
);

-- Conservation: one member's credit is another's debt.
select is(
  (select sum(net) from (
    select sum(case when e.creditor_id = m.user_id then e.amount_minor else -e.amount_minor end) as net
    from public.apartment_members m
    join public.ledger_entries e on e.apartment_id = m.apartment_id and m.user_id in (e.debtor_id, e.creditor_id)
    where m.apartment_id = pg_temp.v('flat') and e.kind = 'charge'
    group by m.user_id) positions),
  0::numeric,
  'members'' net positions add up to zero'
);

-- Visibility -------------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.o());
select is_empty($$ select 1 from public.expenses $$, 'an outsider sees no expenses');
select is_empty($$ select 1 from public.ledger_entries $$, 'an outsider sees no debts');

select pg_temp.act_as(pg_temp.r());
select is(
  (select count(*)::int from public.expenses where apartment_id = pg_temp.v('flat')),
  6,
  'every member sees all of the apartment''s expenses'
);

-- Monthly share (FR-06.1) ------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(
  public.get_my_monthly_share(pg_temp.v('flat'), current_date),
  (6667 + 33334 + 50000 + 10000 + 2000 + 3000)::bigint,
  'Anas''s share of this month''s expenses adds up his shares'
);

select * from finish();

rollback;
