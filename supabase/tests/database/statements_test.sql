-- Statements and apartment reports (SRS FR-10.2, AC-14).
begin;

select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

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
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Karachi')::date $$;
create function pg_temp.both() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()))
$$;
create function pg_temp.anas_paid(amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', amount))
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
reset role;
update public.apartments set timezone = 'Asia/Karachi' where id = pg_temp.v('flat')::uuid;

-- The first period: Anas pays for groceries shared with Zubair. Then it is
-- moved into the past and closed, as the job does after its last day.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat')::uuid, 'Groceries', 30000, pg_temp.today() - 15, 'equal',
  pg_temp.both(), pg_temp.anas_paid(30000));
reset role;
update public.settlement_periods set starts_on = pg_temp.today() - 30, ends_on = pg_temp.today() - 10
where apartment_id = pg_temp.v('flat')::uuid;
select private.close_due_periods();
insert into vals select 'first', id::text from public.settlement_periods
where apartment_id = pg_temp.v('flat')::uuid and state = 'closed';
insert into vals select 'second', id::text from public.settlement_periods
where apartment_id = pg_temp.v('flat')::uuid and state = 'open';

-- The second period: Zubair pays Anas back in part, and disputes the next bill.
select pg_temp.act_as(pg_temp.z());
select public.record_payment(pg_temp.v('flat')::uuid, pg_temp.a(), 5000);
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(pg_temp.v('flat')::uuid, 'Cleaning', 20000, pg_temp.today(), 'equal',
  pg_temp.both(), pg_temp.anas_paid(20000))::text);
select pg_temp.act_as(pg_temp.z());
select public.raise_dispute(pg_temp.v('cleaning')::uuid, 'adjustment', 'I was away', 5000);

-- Zubair's statements ---------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('z1', public.get_my_statement(pg_temp.v('flat')::uuid, pg_temp.v('first')::uuid)::text);
insert into vals values ('z2', public.get_my_statement(pg_temp.v('flat')::uuid, pg_temp.v('second')::uuid)::text);
create function pg_temp.s(key text) returns jsonb language sql as $$ select pg_temp.v(key)::jsonb $$;

select is(pg_temp.s('z1') -> 'period' ->> 'state', 'closed', 'a statement says whether its period closed');
select is(
  (select string_agg(e ->> 'title' || ':' || (e ->> 'share_minor') || ':' || (e ->> 'paid_minor'), ',')
   from jsonb_array_elements(pg_temp.s('z1') -> 'expenses') e),
  'Groceries:15000:0', 'it lists the period''s expenses with the reader''s share and what they paid');
select is(jsonb_array_length(pg_temp.s('z1') -> 'payments'), 0, 'and no payments made later');
select is(
  pg_temp.s('z1') -> 'people' -> 0 ->> 'person_id' || ':' || (pg_temp.s('z1') -> 'people' -> 0 ->> 'opening_minor')
    || ':' || (pg_temp.s('z1') -> 'people' -> 0 ->> 'closing_minor'),
  pg_temp.a() || ':0:15000', 'the first period carries nothing in, and closes with what is owed');

select is(
  pg_temp.s('z2') -> 'people' -> 0 ->> 'opening_minor', '15000',
  'the next period carries forward the closing balance');
select is(
  pg_temp.s('z2') -> 'people' -> 0 ->> 'closing_minor', '10000',
  'so far it closes with the payment taken off, and without the disputed bill');
select is(
  pg_temp.s('z2') -> 'people' -> 0 ->> 'closing_disputed_minor', '10000',
  'the disputed share is shown on its own');
select is(
  (select e ->> 'direction' || ':' || (e ->> 'amount_minor') || ':' || (e ->> 'status')
   from jsonb_array_elements(pg_temp.s('z2') -> 'payments') e),
  'sent:5000:provisional', 'a payment the reader made, with its status');
select is(
  (select e ->> 'status' from jsonb_array_elements(pg_temp.s('z2') -> 'expenses') e where e ->> 'title' = 'Cleaning'),
  'disputed', 'an expense keeps its status');

-- Anas sees the same balance from the other side.
select pg_temp.act_as(pg_temp.a());
select is(
  public.get_my_statement(pg_temp.v('flat')::uuid, pg_temp.v('second')::uuid) -> 'people' -> 0 ->> 'closing_minor',
  '-10000', 'from the other side the amounts are owed to the reader');

-- A closed statement does not change.
select pg_temp.act_as(pg_temp.z());
select is(public.get_my_statement(pg_temp.v('flat')::uuid, pg_temp.v('first')::uuid), pg_temp.s('z1'),
  'a closed period''s statement stays the same after later changes');

select throws_ok(
  $$ select public.get_my_statement(pg_temp.v('flat')::uuid, gen_random_uuid()) $$,
  'P0002', 'period_not_found', 'a period of another apartment, or none, is not found');
select pg_temp.act_as(pg_temp.o());
select throws_ok(
  $$ select public.get_my_statement(pg_temp.v('flat')::uuid, pg_temp.v('first')::uuid) $$,
  '42501', 'not_member', 'someone outside the apartment gets no statement');

-- The apartment report --------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('r2', public.get_apartment_report(pg_temp.v('flat')::uuid, pg_temp.v('second')::uuid)::text);
create function pg_temp.member(key text, person uuid) returns jsonb language sql as $$
  select m from jsonb_array_elements(pg_temp.s(key) -> 'members') m where m ->> 'person_id' = person::text
$$;

select is(pg_temp.s('r2') ->> 'total_minor', '20000', 'the report totals the period''s spending');
select is(pg_temp.s('r2') ->> 'open_disputes', '1', 'and counts the open disputes');
select is(
  pg_temp.member('r2', pg_temp.a()) ->> 'share_minor' || ':' || (pg_temp.member('r2', pg_temp.a()) ->> 'paid_minor')
    || ':' || (pg_temp.member('r2', pg_temp.a()) ->> 'received_minor'),
  '10000:20000:5000', 'each member''s share, what they paid, and payments received');
select is(
  pg_temp.member('r2', pg_temp.z()) ->> 'sent_minor' || ':' || (pg_temp.member('r2', pg_temp.z()) ->> 'opening_minor')
    || ':' || (pg_temp.member('r2', pg_temp.z()) ->> 'closing_minor')
    || ':' || (pg_temp.member('r2', pg_temp.z()) ->> 'closing_disputed_minor'),
  '5000:15000:10000:10000', 'payments sent, and the net balance carried forward, at close and disputed');
select is(
  (select sum((m ->> 'closing_minor')::bigint)::int from jsonb_array_elements(pg_temp.s('r2') -> 'members') m),
  0, 'what members owe and are owed adds up to nothing');

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.get_apartment_report(pg_temp.v('flat')::uuid, pg_temp.v('second')::uuid) $$,
  '42501', 'not_admin', 'only admins get the apartment report');

select pg_temp.act_as(pg_temp.a());
select is(
  public.get_apartment_report(pg_temp.v('flat')::uuid, pg_temp.v('first')::uuid) ->> 'total_minor',
  '30000', 'a closed period''s report covers that period');

select * from finish();

rollback;
