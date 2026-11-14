-- What "Other" is: a short label saved with an expense's category.
begin;

select plan(9);

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
insert into vals values ('other', (select id::text from public.expense_categories
  where apartment_id = pg_temp.v('flat') and name = 'Other'));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join((select val from vals where name = 'code'));

create function pg_temp.detail(expense uuid) returns text language sql as $$
  select category_detail from public.expenses where id = expense
$$;

select pg_temp.act_as(pg_temp.z());
insert into vals values ('gas', public.post_expense(
  pg_temp.v('flat'), 'Gas', 4000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
  p_category_id => pg_temp.v('other'), p_category_detail => '  Gas cylinder ')::text);
select is(pg_temp.detail(pg_temp.v('gas')), 'Gas cylinder', 'an expense in Other keeps what it was, trimmed');

select throws_ok(
  $$ select public.post_expense(pg_temp.v('flat'), 'Gas', 4000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
       p_category_detail => 'Gas cylinder') $$,
  '22023', 'category_detail_without_category', 'the label needs a category');
select throws_ok(
  format($$ select public.post_expense(%L, 'Gas', 4000, current_date, 'equal', pg_temp.everyone(), '[]'::jsonb,
       p_category_id => %L, p_category_detail => repeat('x', 61)) $$, pg_temp.v('flat'), pg_temp.v('other')),
  '22023', 'category_detail_too_long', 'and is kept short');
select is(
  pg_temp.detail(public.post_expense(pg_temp.v('flat'), 'Water', 3000, current_date, 'equal',
    pg_temp.everyone(), '[]'::jsonb, p_category_id => pg_temp.v('other'), p_category_detail => '  ')),
  null, 'a blank label is no label');

select lives_ok($$ select public.set_expense_category_detail(pg_temp.v('gas'), 'LPG refill') $$,
  'the person who added it can change the label');
select is(pg_temp.detail(pg_temp.v('gas')), 'LPG refill', 'and the expense shows the new one');
reset role;
select is(
  (select details #>> '{changes,category_detail,to}' from public.audit_events
   where entity_id = pg_temp.v('gas') and action = 'edited' order by id desc limit 1),
  'LPG refill', 'the change is in the history');

select pg_temp.act_as(pg_temp.j());
select throws_ok($$ select public.set_expense_category_detail(pg_temp.v('gas'), 'Mine') $$,
  '42501', 'not_allowed', 'another member cannot change it');
select pg_temp.act_as(pg_temp.s());
select throws_ok($$ select public.set_expense_category_detail(pg_temp.v('gas'), 'Mine') $$,
  'P0002', 'expense_not_found', 'someone outside the flat learns nothing about it');

select * from finish();
rollback;
