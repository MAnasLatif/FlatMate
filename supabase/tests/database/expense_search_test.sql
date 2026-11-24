-- Expense search and monthly comparison (SRS FR-10.1).
begin;

select plan(19);

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

-- Joining needs an admin's approval: ask with the code, then approve as an
-- admin of the apartment, and carry on as the person who joined.
create function pg_temp.join(code text) returns void language plpgsql as $$
declare
  joiner_claims text := current_setting('request.jwt.claims', true);
  result jsonb := public.join_apartment(code);
  admin uuid;
begin
  if result ->> 'status' not in ('requested', 'pending') then
    raise exception 'join failed: %', result;
  end if;
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
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Karachi')::date $$;
create function pg_temp.month() returns date language sql as $$ select date_trunc('month', pg_temp.today())::date $$;
create function pg_temp.people(variadic ids uuid[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('user_id', id)) from unnest(ids) id
$$;
create function pg_temp.paid_by(id uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', id, 'amount_minor', amount))
$$;
-- The titles a search finds this month, in order.
create function pg_temp.found(
  p_member uuid default null, p_category uuid default null, p_status text default null,
  p_min bigint default null, p_max bigint default null, p_query text default null
) returns text[] language sql as $$
  select coalesce(array_agg(title order by title), '{}')
  from public.search_expenses(pg_temp.v('flat')::uuid, pg_temp.month(), (pg_temp.month() + interval '1 month')::date,
    p_member, p_category, p_status, p_min, p_max, p_query)
$$;

-- Anas creates the flat; Zubair and Ajmal join.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select public.add_category(pg_temp.v('flat')::uuid, 'Food');
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join(pg_temp.v('code'));
reset role;
update public.apartments set timezone = 'Asia/Karachi' where id = pg_temp.v('flat')::uuid;
insert into vals select 'food', id::text from public.expense_categories
where apartment_id = pg_temp.v('flat')::uuid and name = 'Food';

-- This month: groceries (Anas and Zubair, paid by Anas, Food), an unpaid
-- internet bill for everyone, a repair Ajmal paid for Anas alone, and a
-- cancelled pizza. Last month: a takeaway Anas and Zubair shared.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat')::uuid, 'Groceries', 30000, pg_temp.today(), 'equal',
  pg_temp.people(pg_temp.a(), pg_temp.z()), pg_temp.paid_by(pg_temp.a(), 30000), pg_temp.v('food')::uuid);
select public.post_expense(
  p_apartment_id => pg_temp.v('flat')::uuid, p_title => 'Internet', p_amount_minor => 90000,
  p_expense_date => pg_temp.today(), p_split_method => 'equal',
  p_participants => pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j()), p_payers => '[]'::jsonb);
insert into vals values ('pizza', public.post_expense(pg_temp.v('flat')::uuid, 'Pizza', 12000, pg_temp.today(), 'equal',
  pg_temp.people(pg_temp.a(), pg_temp.z()), pg_temp.paid_by(pg_temp.a(), 12000))::text);
select public.void_expense(pg_temp.v('pizza')::uuid, 'Added twice');
select public.post_expense(pg_temp.v('flat')::uuid, 'Takeaway', 20000, (pg_temp.month() - 1), 'equal',
  pg_temp.people(pg_temp.a(), pg_temp.z()), pg_temp.paid_by(pg_temp.a(), 20000));
select pg_temp.act_as(pg_temp.j());
select public.post_expense(
  p_apartment_id => pg_temp.v('flat')::uuid, p_title => 'Repair', p_amount_minor => 50000,
  p_expense_date => pg_temp.today(), p_split_method => 'equal',
  p_participants => pg_temp.people(pg_temp.a()), p_payers => pg_temp.paid_by(pg_temp.j(), 50000),
  p_description => 'Fixed the tap_handle, 100% done');

-- Search ---------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.found(), array['Groceries', 'Internet', 'Pizza', 'Repair'],
  'with no filter, a month''s expenses are found, and only that month''s');
select is(pg_temp.found(p_member => pg_temp.z()), array['Groceries', 'Internet', 'Pizza'],
  'a member''s expenses are those they share in');
select is(pg_temp.found(p_member => pg_temp.j()), array['Internet', 'Repair'],
  'or paid for');
select is(pg_temp.found(p_category => pg_temp.v('food')::uuid), array['Groceries'], 'by category');
select is(pg_temp.found(p_status => 'unpaid'), array['Internet'], 'a bill nobody has paid yet');
select is(pg_temp.found(p_status => 'void'), array['Pizza'], 'cancelled expenses');
select is(pg_temp.found(p_status => 'provisional'), array['Groceries', 'Internet', 'Repair'],
  'by status');
select is(pg_temp.found(p_min => 30000, p_max => 50000), array['Groceries', 'Repair'],
  'by amount, both ends included');
select is(pg_temp.found(p_query => 'groc'), array['Groceries'], 'by title, ignoring case');
select is(pg_temp.found(p_query => 'tap_'), array['Repair'], 'by the notes');
select is(pg_temp.found(p_query => '_'), array['Repair'], 'a wildcard typed is matched literally');
select is(pg_temp.found(p_member => pg_temp.z(), p_min => 20000), array['Groceries', 'Internet'],
  'filters combine');
select throws_ok(
  $$ select * from public.search_expenses(pg_temp.v('flat')::uuid, pg_temp.month(), pg_temp.month() + 1, p_min_minor => 500, p_max_minor => 100) $$,
  '22023', 'invalid_amount_range', 'a minimum above the maximum is refused');
select throws_ok(
  $$ select * from public.search_expenses(pg_temp.v('flat')::uuid, pg_temp.month(), pg_temp.month() + 1, p_status => 'paid') $$,
  '22023', 'invalid_status', 'an unknown status is refused');

select pg_temp.act_as(pg_temp.o());
select is(pg_temp.found(), '{}'::text[], 'someone outside the apartment finds nothing');

-- Comparison -----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(
  array(select month || ':' || total_minor || ':' || my_share_minor from public.get_monthly_spending(pg_temp.v('flat')::uuid, 2)),
  array[(pg_temp.month() - interval '1 month')::date || ':20000:10000', pg_temp.month() || ':170000:95000'],
  'each month shows the apartment''s total and the caller''s share, oldest first, without cancelled expenses');
select is((select count(*)::int from public.get_monthly_spending(pg_temp.v('flat')::uuid)), 6, 'six months by default');
select throws_ok($$ select * from public.get_monthly_spending(pg_temp.v('flat')::uuid, 25) $$,
  '22023', 'invalid_months', 'at most two years');
select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select * from public.get_monthly_spending(pg_temp.v('flat')::uuid) $$,
  '42501', 'not_member', 'only members see an apartment''s totals');

select * from finish();

rollback;
