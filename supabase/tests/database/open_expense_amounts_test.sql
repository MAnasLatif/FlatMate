-- What is still open on each expense for the signed-in user, per person,
-- after payments cover the oldest debts first (SRS FR-06.1, FR-06.2, AC-09).
begin;

select plan(7);

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
-- Dated a given number of days ago, so they have an order: in one test
-- transaction every record has the same created_at.
create function pg_temp.debt(debtor uuid, payer uuid, amount bigint, title text, days_ago int) returns uuid language plpgsql as $$
declare
  claims text := current_setting('request.jwt.claims', true);
  created uuid;
begin
  perform pg_temp.act_as(payer);
  created := public.post_expense(pg_temp.flat(), title, amount, current_date - days_ago, 'fixed',
    jsonb_build_array(jsonb_build_object('user_id', debtor, 'amount_minor', amount)),
    jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount)));
  perform set_config('request.jwt.claims', claims, true);
  return created;
end;
$$;
-- One expense's open amounts for the caller, as "person:owe:owed" by person.
create function pg_temp.open(expense uuid) returns text language sql as $$
  select coalesce(string_agg(p.display_name || ':' || o.owe_open_minor || ':' || o.owed_open_minor, ', '
    order by p.display_name), '')
  from public.get_my_open_expense_amounts(pg_temp.flat(), array[expense]) o
  join public.profiles p on p.id = o.counterparty_id
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

-- Zubair owes Anas Rs 1,000 for lunch, then Rs 500 for dinner, then a third
-- of Rs 900 groceries, as does Yasir.
insert into vals values ('lunch', pg_temp.debt(pg_temp.z(), pg_temp.a(), 100000, 'Lunch', 3)::text);
insert into vals values ('dinner', pg_temp.debt(pg_temp.z(), pg_temp.a(), 50000, 'Dinner', 2)::text);
select pg_temp.act_as(pg_temp.a());
insert into vals values ('groceries', public.post_expense(pg_temp.flat(), 'Groceries', 90000, current_date - 1, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.y())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 90000)))::text);

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.open(pg_temp.v('lunch')::uuid), 'Anas:100000:0', 'before paying, all of it is open');

-- Zubair pays Rs 1,200; Yasir pays his Rs 300.
select public.record_payment(pg_temp.flat(), pg_temp.a(), 120000);
select pg_temp.act_as(pg_temp.y());
select public.record_payment(pg_temp.flat(), pg_temp.a(), 30000);

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.open(pg_temp.v('lunch')::uuid) || ' / ' || pg_temp.open(pg_temp.v('dinner')::uuid)
          || ' / ' || pg_temp.open(pg_temp.v('groceries')::uuid),
  'Anas:0:0 / Anas:30000:0 / Anas:30000:0', 'a payment covers the oldest expense first');
select pg_temp.act_as(pg_temp.a());
select is(pg_temp.open(pg_temp.v('dinner')::uuid), 'Zubair:0:30000', 'Anas sees what is still owed to him');
select is(pg_temp.open(pg_temp.v('groceries')::uuid), 'Yasir:0:0, Zubair:0:30000',
  'per person: Yasir has settled his part, Zubair has not');
select is(
  (select count(*)::int from public.get_my_open_expense_amounts(pg_temp.flat(),
     array[pg_temp.v('lunch')::uuid, pg_temp.v('dinner')::uuid])),
  2, 'only the expenses asked for');
select is(
  (select count(*)::int from public.get_my_open_expense_amounts(pg_temp.flat(), null)), 0,
  'none asked for, none returned');

select pg_temp.act_as(pg_temp.o());
select is(pg_temp.open(pg_temp.v('lunch')::uuid), '', 'someone outside the flat sees nothing');

select * from finish();
rollback;
