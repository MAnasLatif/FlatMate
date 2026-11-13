-- Netting off what two members owe each other (SRS FR-06.4, AC-09).
begin;

select plan(14);

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

create function pg_temp.pair(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select (owe_final_minor + owe_provisional_minor) || ' | ' || (owed_final_minor + owed_provisional_minor)
     from public.get_my_pair_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;
create function pg_temp.obligations(counterparty uuid) returns text language sql as $$
  select coalesce(string_agg(title || ':' || direction || ':' || amount_minor || '/' || covered_minor, ' '
    order by direction, expense_date, title), '')
  from public.get_my_pair_obligations(pg_temp.v('flat'), counterparty)
$$;
create function pg_temp.split_two(title text, payer uuid, other uuid, amount bigint, days_ago int) returns uuid
language sql as $$
  select public.post_expense(
    pg_temp.v('flat'), title, amount, current_date - days_ago, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', payer), jsonb_build_object('user_id', other)),
    jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount)))
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Zubair owes Anas Rs 100 for cleaning (older) and Rs 50 for snacks; Anas owes Zubair Rs 120 for groceries.
select pg_temp.act_as(pg_temp.a());
select pg_temp.split_two('Cleaning', pg_temp.a(), pg_temp.z(), 20000, 3);
select pg_temp.split_two('Snacks', pg_temp.a(), pg_temp.z(), 10000, 1);
select pg_temp.act_as(pg_temp.z());
select pg_temp.split_two('Groceries', pg_temp.z(), pg_temp.a(), 24000, 2);

-- Netting off ---------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(pg_temp.pair(pg_temp.z()), '12000 | 15000', 'Anas owes Zubair Rs 120 and is owed Rs 150');
select throws_ok($$ select public.net_off(pg_temp.v('flat'), pg_temp.z(), 12001) $$,
  '22023', 'offset_exceeds_debt', 'an offset cannot be more than either owes the other');
insert into vals values ('offset', public.net_off(pg_temp.v('flat'), pg_temp.z(), null,
  '99999999-9999-9999-9999-999999999999')::text);
select is(pg_temp.pair(pg_temp.z()), '0 | 3000', 'netting off Rs 120 leaves Zubair owing Rs 30 and nothing the other way');
select is(
  (select amount_minor from public.offsets where id = pg_temp.v('offset')),
  12000::bigint,
  'with no amount given, it offsets as much as possible'
);
select is(
  (select string_agg(left(debtor_id::text, 1) || '>' || left(creditor_id::text, 1) || ':' || amount_minor, ' '
     order by debtor_id) from public.ledger_entries where offset_id = pg_temp.v('offset')),
  '1>2:12000 2>1:12000',
  'it is a pair of equal entries, so the net between them does not change'
);
select is(
  public.net_off(pg_temp.v('flat'), pg_temp.z(), null, '99999999-9999-9999-9999-999999999999'),
  pg_temp.v('offset'),
  'retrying the same request returns the same offset'
);
select is(
  pg_temp.obligations(pg_temp.z()),
  'Groceries:owe:12000/12000 Cleaning:owed:10000/10000 Snacks:owed:5000/2000',
  'it covers each side''s obligations oldest first, so it is clear which are settled (FR-06.4)'
);
select throws_ok($$ select public.net_off(pg_temp.v('flat'), pg_temp.z()) $$,
  '22023', 'nothing_to_offset', 'once one side owes nothing there is nothing left to offset');

-- Payments after an offset --------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 3001) $$,
  '22023', 'payment_exceeds_debt', 'Zubair cannot pay more than the Rs 30 he still owes (AC-09)');
select lives_ok($$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 3000) $$, 'he pays the Rs 30');
select is(pg_temp.pair(pg_temp.a()), '0 | 0', 'and they are square, with nothing counted twice');

-- Who can ------------------------------------------------------------------------------------

select throws_ok($$ select public.net_off(pg_temp.v('flat'), pg_temp.z()) $$,
  '22023', 'cannot_offset_with_yourself', 'nobody offsets with themselves');
select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select public.net_off(pg_temp.v('flat'), pg_temp.a()) $$,
  '42501', 'not_member', 'someone outside the apartment cannot offset');
select pg_temp.act_as(pg_temp.j());
select is_empty($$ select 1 from public.offsets $$, 'a member who is not part of an offset cannot see it');

select * from finish();

rollback;
