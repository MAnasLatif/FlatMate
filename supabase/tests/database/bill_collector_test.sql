-- Who will pay a bill that is not paid yet (its collector).
begin;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'sara@example.test', '{"display_name": "Sara"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

-- Joining needs an admin's approval: ask with the code, then approve as an
-- admin of the apartment, and carry on as the person who joined.
create function pg_temp.join(code text) returns void language plpgsql as $$
declare
  joiner_claims text := current_setting('request.jwt.claims', true);
  result jsonb := public.join_apartment(code);
  admin uuid;
begin
  perform set_config('role', 'postgres', true);
  select user_id into admin from public.apartment_members
  where apartment_id = (result ->> 'apartment_id')::uuid and role = 'admin' and left_at is null
  order by joined_at
  limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.approve_join_request((result ->> 'request_id')::uuid);
  perform set_config('request.jwt.claims', joiner_claims, true);
end;
$$;

create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.s() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.everyone() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a()),
    jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.j()))
$$;
create function pg_temp.collector(expense uuid) returns uuid language sql as $$
  select collector_id from public.expenses where id = expense
$$;

-- Anas (admin), Zubair and Ajmal share Flat 4B. Sara is in no flat with them.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join((select val from vals where name = 'code'));

-- Adding a bill with its collector ------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('electricity', public.post_expense(
  pg_temp.v('flat'), 'Electricity', 90000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
  p_collector_id => pg_temp.j())::text);
select is(pg_temp.collector(pg_temp.v('electricity')), pg_temp.j(), 'an unpaid bill names who will pay it');

reset role;
select is(
  (select count(*)::int from public.ledger_entries where expense_id = pg_temp.v('electricity')),
  0, 'naming a collector creates no debts: nobody owes anything until the bill is paid');
select is(
  (select record_type || ':' || record_id from public.notifications
   where user_id = pg_temp.j() and type = 'expense.collector_set'),
  'expense:' || pg_temp.v('electricity'), 'the collector is told, and it opens the bill');
select is(
  (select count(*)::int from realtime.messages
   where topic = 'apartment:' || pg_temp.v('flat') and payload ->> 'kind' = 'expense'),
  1, 'adding the bill and its collector sends one change event');

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.post_expense(pg_temp.v('flat'), 'Gas', 3000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
       p_collector_id => pg_temp.s()) $$,
  '22023', 'collector_not_member', 'the collector must be a member');
select throws_ok(
  $$ select public.post_expense(pg_temp.v('flat'), 'Snacks', 3000, current_date, 'equal', pg_temp.everyone(),
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 3000)),
       p_collector_id => pg_temp.j()) $$,
  '22023', 'collector_for_paid_expense', 'a paid expense has no collector');
select lives_ok(
  $$ select public.post_expense(pg_temp.v('flat'), 'Water', 3000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb) $$,
  'a bill can still be added without a collector');

-- Changing the collector -----------------------------------------------------------------

select pg_temp.act_as(pg_temp.j());
select throws_ok(
  $$ select public.set_bill_collector(pg_temp.v('electricity'), pg_temp.a()) $$,
  '42501', 'not_allowed', 'only the person who added it or an admin changes the collector');

select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.set_bill_collector(pg_temp.v('electricity'), pg_temp.a()) $$,
  'the person who added it hands it to someone else');
select is(pg_temp.collector(pg_temp.v('electricity')), pg_temp.a(), 'and the bill shows the new collector');

select pg_temp.act_as(pg_temp.a());
select lives_ok($$ select public.set_bill_collector(pg_temp.v('electricity'), null) $$,
  'an admin can clear it');

select pg_temp.act_as(pg_temp.s());
select throws_ok($$ select public.set_bill_collector(pg_temp.v('electricity'), pg_temp.z()) $$,
  'P0002', 'expense_not_found', 'someone outside the flat learns nothing about the bill');

-- Once paid ----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select public.set_bill_collector(pg_temp.v('electricity'), pg_temp.j());
select pg_temp.act_as(pg_temp.j());
select public.record_bill_payment(pg_temp.v('electricity'),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.j(), 'amount_minor', 90000)));
select is(pg_temp.collector(pg_temp.v('electricity')), pg_temp.j(), 'the collector stays on record once it is paid');
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.set_bill_collector(pg_temp.v('electricity'), pg_temp.a()) $$,
  '22023', 'collector_for_paid_expense', 'and can no longer be changed');

select * from finish();
rollback;
