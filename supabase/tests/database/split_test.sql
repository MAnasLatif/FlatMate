-- Split arithmetic. The same cases as app/src/features/expenses/split.test.ts.
begin;

select plan(22);

-- The ids sort Anas, Zubair, Ajmal, which decides who gets leftover units.
create function pg_temp.a() returns text language sql as $$ select '11111111-1111-1111-1111-111111111111' $$;
create function pg_temp.z() returns text language sql as $$ select '22222222-2222-2222-2222-222222222222' $$;
create function pg_temp.j() returns text language sql as $$ select '33333333-3333-3333-3333-333333333333' $$;
create function pg_temp.d() returns text language sql as $$ select '44444444-4444-4444-4444-444444444444' $$;

create function pg_temp.people(variadic ids text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('user_id', id)) from unnest(ids) id
$$;
create function pg_temp.amounts(p_total bigint, p_method text, p_participants jsonb) returns bigint[] language sql as $$
  select array_agg(amount_minor order by user_id) from private.compute_shares(p_total, p_method, p_participants)
$$;

-- Shares -------------------------------------------------------------------------------

select is(
  pg_temp.amounts(20000, 'equal', pg_temp.people(pg_temp.j(), pg_temp.a(), pg_temp.z())),
  array[6667, 6667, 6666]::bigint[],
  'Rs 200 equally is 66.67, 66.67, 66.66 (SRS 5.1)'
);

select is(
  pg_temp.amounts(100000, 'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j())),
  array[33334, 33333, 33333]::bigint[],
  'Rs 1,000 equally is 333.34, 333.33, 333.33 (SRS 5.1)'
);

select is(
  pg_temp.amounts(100000, 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 2500))),
  array[50000, 25000, 25000]::bigint[],
  '50% / 25% / 25% is exact (SRS 5.1, AC-03)'
);

select is(
  pg_temp.amounts(99999, 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 2500))),
  array[49999, 25000, 25000]::bigint[],
  'leftover units go to the largest remainders, ties by user id'
);

select is(
  pg_temp.amounts(10001, 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 0))),
  array[5001, 5000, 0]::bigint[],
  'a participant given 0% is excluded'
);

select is(
  pg_temp.amounts(15000, 'fixed', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 10000),
    jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 5000),
    jsonb_build_object('user_id', pg_temp.j(), 'amount_minor', 0))),
  array[10000, 5000, 0]::bigint[],
  'fixed amounts are taken as given'
);

select is(
  pg_temp.amounts(1, 'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j())),
  array[1, 0, 0]::bigint[],
  'one minor unit between three people'
);

select is(
  pg_temp.amounts(1000000000000, 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 3333),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 3333),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 3334))),
  array[333300000000, 333300000000, 333400000000]::bigint[],
  'exact at the largest allowed amount'
);

select throws_ok(
  format('select * from private.compute_shares(10000, %L, %L)', 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 4999))),
  '22023', 'percentages_must_total_100', 'percentages must add up to 100'
);
select throws_ok(
  format('select * from private.compute_shares(10000, %L, %L)', 'fixed', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 4000))),
  '22023', 'fixed_amounts_must_match_total', 'fixed amounts must add up to the total'
);
select throws_ok(
  format('select * from private.compute_shares(10000, %L, %L)', 'fixed', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 10001),
    jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', -1))),
  '22023', 'invalid_share', 'a negative share is rejected'
);
select throws_ok(
  format('select * from private.compute_shares(10000, %L, %L)', 'fixed', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 4999.5),
    jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 5000.5))),
  '22023', 'invalid_share', 'a fractional share is rejected'
);
select throws_ok(
  $$ select * from private.compute_shares(10000, 'equal', '[]'::jsonb) $$,
  '22023', 'no_participants', 'an expense needs participants'
);
select throws_ok(
  format('select * from private.compute_shares(10000, %L, %L)', 'equal', pg_temp.people(pg_temp.a(), pg_temp.a())),
  '22023', 'duplicate_participant', 'the same person cannot be listed twice'
);
select throws_ok(
  format('select * from private.compute_shares(0, %L, %L)', 'equal', pg_temp.people(pg_temp.a())),
  '22023', 'invalid_total', 'a total of zero is rejected'
);
select throws_ok(
  format('select * from private.compute_shares(1000000000001, %L, %L)', 'equal', pg_temp.people(pg_temp.a())),
  '22023', 'invalid_total', 'a total over the maximum is rejected'
);

-- Debts ---------------------------------------------------------------------------------

create function pg_temp.debts(p_contributions jsonb, p_shares jsonb) returns text language sql as $$
  select coalesce(string_agg(left(debtor_id::text, 1) || '>' || left(creditor_id::text, 1) || ':' || amount_minor, ' '
                             order by debtor_id, creditor_id), '')
  from private.match_debts(p_contributions, p_shares)
$$;
create function pg_temp.shares_json(p_total bigint, variadic ids text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor))
  from private.compute_shares(p_total, 'equal', (select jsonb_agg(jsonb_build_object('user_id', id)) from unnest(ids) id))
$$;

select is(
  pg_temp.debts(
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)),
    pg_temp.shares_json(20000, pg_temp.a(), pg_temp.z(), pg_temp.j())),
  '2>1:6667 3>1:6666',
  'everyone else owes a single payer their share (SRS 5.1)'
);

select is(
  pg_temp.debts(
    jsonb_build_array(
      jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000),
      jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 10000)),
    pg_temp.shares_json(30000, pg_temp.a(), pg_temp.z(), pg_temp.j())),
  '3>1:10000',
  'each payer covers their own share first (AC-04)'
);

select is(
  pg_temp.debts(
    jsonb_build_array(
      jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 25000),
      jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 15000)),
    pg_temp.shares_json(40000, pg_temp.a(), pg_temp.z(), pg_temp.j(), pg_temp.d())),
  '3>1:10000 4>1:5000 4>2:5000',
  'several debtors are matched across several creditors exactly'
);

select is(
  pg_temp.debts(
    jsonb_build_array(
      jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 10000),
      jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 10000)),
    pg_temp.shares_json(20000, pg_temp.a(), pg_temp.z())),
  '',
  'no debts when everyone paid exactly their share'
);

select is(
  pg_temp.debts(
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 10000)),
    pg_temp.shares_json(10000, pg_temp.z(), pg_temp.j())),
  '2>1:5000 3>1:5000',
  'a payer who is not a participant is owed the whole amount'
);

select throws_ok(
  format('select * from private.match_debts(%L, %L)',
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 9999)),
    pg_temp.shares_json(10000, pg_temp.a(), pg_temp.z())),
  '22023', 'contributions_must_match_total', 'contributions must match the shares'
);

select * from finish();

rollback;
