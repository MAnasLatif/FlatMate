-- Balances and shared expenses between two people (SRS FR-06.2, FR-06.3, AC-04).
begin;

select plan(14);

-- The ids sort Anas, Zubair, Ajmal, which decides who gets leftover units.
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

-- One person's gross position with another, as "owe final/provisional/disputed | owed ...".
create function pg_temp.pair(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select owe_final_minor || '/' || owe_provisional_minor || '/' || owe_disputed_minor || ' | '
         || owed_final_minor || '/' || owed_provisional_minor || '/' || owed_disputed_minor
     from public.get_my_pair_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;
create function pg_temp.shared(counterparty uuid) returns text language sql as $$
  select coalesce(string_agg(title || ':' || owe_minor || '/' || owed_minor, ' ' order by expense_date desc, title), '')
  from public.get_my_pair_expenses(pg_temp.v('flat'), counterparty)
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Anas pays Rs 200 for cleaning, split three ways (SRS 5.1).
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(
  pg_temp.v('flat'), 'Cleaning', 20000, current_date - 1, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
                    jsonb_build_object('user_id', pg_temp.j())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)))::text);
-- Zubair pays Rs 300 for groceries he shares with Anas.
select pg_temp.act_as(pg_temp.z());
insert into vals values ('groceries', public.post_expense(
  pg_temp.v('flat'), 'Groceries', 30000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 30000)))::text);

-- Gross balances --------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(pg_temp.pair(pg_temp.z()), '0/15000/0 | 0/6667/0',
  'Anas owes Zubair 150.00 for groceries and is owed 66.67 for cleaning, both provisional');
select is(pg_temp.pair(pg_temp.j()), '0/0/0 | 0/6666/0', 'Ajmal owes Anas 66.66');
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.pair(pg_temp.a()), '0/6667/0 | 0/15000/0', 'Zubair sees the same two amounts the other way round');
select is(pg_temp.pair(pg_temp.j()), 'none', 'Zubair and Ajmal have nothing between them');

-- Shared expenses -------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(pg_temp.shared(pg_temp.z()), 'Groceries:15000/0 Cleaning:0/6667',
  'Anas sees both expenses with Zubair, newest first, with what each adds in each direction');
select is(
  (select count(*)::int from public.get_my_pair_expenses(pg_temp.v('flat'), pg_temp.z(), 1, 1)),
  1,
  'the list is paged'
);
select throws_ok($$ select * from public.get_my_pair_expenses(pg_temp.v('flat'), pg_temp.z(), 500, 0) $$,
  '22023', 'invalid_page', 'pages are at most 50 rows');

select pg_temp.act_as(pg_temp.j());
select is(pg_temp.shared(pg_temp.z()), '', 'Ajmal cannot use the pair view to read what Anas and Zubair owe each other');

select pg_temp.act_as(pg_temp.o());
select is(pg_temp.pair(pg_temp.a()), 'none', 'an outsider gets no balances');
select is(pg_temp.shared(pg_temp.a()), '', 'and no expenses');

-- Changes over time -----------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select public.void_expense(pg_temp.v('cleaning'));
select is(pg_temp.shared(pg_temp.z()), 'Groceries:15000/0 Cleaning:0/0',
  'a voided expense stays in the history with nothing left between them');
select is(pg_temp.pair(pg_temp.z()), '0/15000/0 | 0/0/0', 'and no longer counts');

reset role;
update public.expenses set status = 'disputed' where id = pg_temp.v('groceries');
select pg_temp.act_as(pg_temp.a());
select is(pg_temp.pair(pg_temp.z()), '0/0/15000 | 0/0/0', 'a disputed expense is reported as disputed');

select pg_temp.act_as(pg_temp.z());
select public.leave_apartment(pg_temp.v('flat'));
select is(pg_temp.pair(pg_temp.a()), '0/0/0 | 0/0/15000', 'a member who has left still sees what is between them and others');

select * from finish();

rollback;
