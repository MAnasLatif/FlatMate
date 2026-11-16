-- Repeatable expenses: templates, the scheduled charges and bills waiting for
-- an admin (SRS FR-04, AC-02, AC-05).
begin;

select plan(40);

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

-- The flat's today and this month, in Asia/Karachi like the apartment.
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Karachi')::date $$;
create function pg_temp.this_month() returns date language sql as $$ select date_trunc('month', pg_temp.today())::date $$;

-- Moves a template's next charge back to an earlier month, as if time had passed.
create function pg_temp.due_since(template uuid, months integer) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  update public.recurring_templates
  set next_period = (pg_temp.this_month() - make_interval(months => months))::date
  where id = template;
end;
$$;

create function pg_temp.charge() returns integer language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  return private.charge_due_recurring();
end;
$$;

-- Anas (admin), Zubair and Ajmal share Flat 4B. Sara is in no flat with them.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join((select val from vals where name = 'code'));

-- Dates ----------------------------------------------------------------------------------

reset role;
select is(private.period_bill_date('2027-02-01', 31), '2027-02-28'::date,
  'a bill day of 31 falls on the last day of February');
select is(private.period_bill_date('2028-02-01', 30), '2028-02-29'::date, 'and of a leap February');
select is(private.period_bill_date('2027-04-01', 5), '2027-04-05'::date, 'any other day stays as it is');

-- Who can manage templates ---------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, 9,
       'equal', pg_temp.everyone()) $$,
  '42501', 'not_admin', 'a member cannot add a repeatable expense, even through the API');

select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Electricity', 'variable', 500000, 1, 5, null,
       'equal', pg_temp.everyone()) $$,
  '22023', 'variable_amount_not_allowed', 'a variable bill has no amount ahead of time');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Electricity', 'variable', null, 1, 5, null,
       'fixed', jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 1))) $$,
  '22023', 'fixed_split_needs_fixed_amount', 'nor fixed shares');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 2, 1, null,
       'equal', pg_temp.everyone()) $$,
  '22023', 'invalid_interval', 'it repeats every 1, 3 or 12 months');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, null,
       'fixed', jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 100))) $$,
  '22023', null, 'fixed shares must add up to the amount');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, null,
       'equal', jsonb_build_array(jsonb_build_object('user_id', pg_temp.s()))) $$,
  '22023', 'participant_not_member', 'only members can share it');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, null,
       'equal', pg_temp.everyone(), p_first_period => (pg_temp.this_month() - interval '1 month')::date) $$,
  '22023', 'invalid_first_period', 'the first charge cannot be in a past month');

insert into vals values ('rent', public.create_recurring_template(
  pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, 9, 'equal', pg_temp.everyone(),
  p_collector_id => pg_temp.z(), p_client_request_id => 'aaaaaaaa-0000-0000-0000-000000000001')::text);
select is(
  public.create_recurring_template(
    pg_temp.v('flat'), 'Rent', 'fixed', 9000000, 1, 1, 9, 'equal', pg_temp.everyone(),
    p_collector_id => pg_temp.z(), p_client_request_id => 'aaaaaaaa-0000-0000-0000-000000000001'),
  pg_temp.v('rent'), 'a retried request returns the same template');
select is(
  (select next_period from public.recurring_templates where id = pg_temp.v('rent')),
  case when pg_temp.today() = pg_temp.this_month() then pg_temp.this_month()
       else (pg_temp.this_month() + interval '1 month')::date end,
  'the first charge is the next bill day still to come');

-- A second admin manages them too (AC-02).
select public.set_member_role(pg_temp.v('flat'), pg_temp.z(), 'admin');
select pg_temp.act_as(pg_temp.z());
insert into vals values ('power', public.create_recurring_template(
  pg_temp.v('flat'), 'Electricity', 'variable', null, 1, 5, 7, 'equal', pg_temp.everyone())::text);
select is((select count(*)::int from public.recurring_templates where apartment_id = pg_temp.v('flat')), 2,
  'a second admin can add one and sees them all');

select pg_temp.act_as(pg_temp.j());
select is_empty($$ select id from public.recurring_templates $$, 'a member cannot read the templates');
select throws_ok($$ select public.archive_recurring_template(pg_temp.v('rent')) $$,
  'P0002', 'recurring_template_not_found', 'or archive one');

-- Fixed charges --------------------------------------------------------------------------

select pg_temp.due_since(pg_temp.v('rent'), 1);
select pg_temp.due_since(pg_temp.v('power'), 0);
update public.recurring_templates set bill_day = 1 where id = pg_temp.v('power');
select is(pg_temp.charge(), 3, 'the job charges last month and this month for rent, and opens this month''s electricity');
select is(pg_temp.charge(), 0, 'running it again charges nothing twice');

select is(
  (select count(*)::int from public.recurring_instances where template_id = pg_temp.v('rent') and state = 'posted'),
  2, 'each period of a fixed template is charged once');
select is(
  (select next_period from public.recurring_templates where id = pg_temp.v('rent')),
  (pg_temp.this_month() + interval '1 month')::date, 'and the template moves on to next month');

insert into vals select 'rent_now', i.expense_id::text from public.recurring_instances i
where i.template_id = pg_temp.v('rent') and i.billing_period = pg_temp.this_month();
select results_eq(
  $$ select title, amount_minor, paid_status, status, expense_date, due_date, collector_id, category_id
     from public.expenses where id = pg_temp.v('rent_now') $$,
  $$ values ('Rent'::text, 9000000::bigint, 'unpaid'::text, 'provisional'::text, pg_temp.this_month(),
            pg_temp.this_month() + 9, pg_temp.z(), null::uuid) $$,
  'the charge is an unpaid bill on the bill day, due 9 days later, naming who will pay it');
select results_eq(
  $$ select amount_minor from public.expense_splits where expense_id = pg_temp.v('rent_now') order by user_id $$,
  $$ values (3000000::bigint), (3000000::bigint), (3000000::bigint) $$,
  'it is shared with the template''s split');
select is(
  (select count(*)::int from public.ledger_entries where expense_id = pg_temp.v('rent_now')),
  0, 'nobody owes anyone until a member pays the bill');
select is(
  (select count(*)::int from public.notifications where record_id = pg_temp.v('rent_now') and type = 'expense.created'),
  3, 'everyone sharing it is told');
select ok(
  exists (select 1 from realtime.messages
          where topic = 'apartment:' || pg_temp.v('flat') and payload ->> 'kind' = 'expense'),
  'open apps are told the expenses changed');

-- Variable bills -------------------------------------------------------------------------

insert into vals select 'power_now', id::text from public.recurring_instances where template_id = pg_temp.v('power');
select is(
  (select state || ':' || reason from public.recurring_instances where id = pg_temp.v('power_now')),
  'waiting:amount_needed', 'a variable bill waits for its amount');
select is(
  (select count(*)::int from public.expenses where apartment_id = pg_temp.v('flat') and title = 'Electricity'),
  0, 'no charge is made up for it');
select results_eq(
  $$ select user_id from public.notifications where type = 'recurring_bill.amount_needed' order by user_id $$,
  $$ values (pg_temp.a()), (pg_temp.z()) $$,
  'every admin is asked for the amount');

select pg_temp.act_as(pg_temp.j());
select throws_ok(
  $$ select public.post_recurring_bill(pg_temp.v('power_now'), 450000, 'equal', pg_temp.everyone()) $$,
  'P0002', 'recurring_bill_not_found', 'a member cannot enter it');

select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.post_recurring_bill(pg_temp.v('power_now'), 450000, 'equal', pg_temp.everyone(),
       pg_temp.this_month() - 1) $$,
  '22023', 'due_date_before_expense_date', 'it cannot be due before it arrived');
-- This month only, Ajmal pays half (FR-04.4).
insert into vals values ('power_bill', public.post_recurring_bill(
  pg_temp.v('power_now'), 450001, 'percentage',
  jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 5000)),
  pg_temp.this_month() + 7)::text);
select results_eq(
  $$ select sum(amount_minor) from public.expense_splits where expense_id = pg_temp.v('power_bill') $$,
  $$ values (450001::numeric) $$, 'an admin enters the amount, and the shares add up exactly');
select is(
  public.post_recurring_bill(pg_temp.v('power_now'), 1, 'equal', pg_temp.everyone()),
  pg_temp.v('power_bill'), 'entering it again returns the same charge');
reset role;
select is(
  (select split_method || ':' || participants::text from public.recurring_templates where id = pg_temp.v('power')),
  'equal:' || pg_temp.everyone()::text, 'one month''s split leaves the template as it was');

-- Changes, pausing and people who leave --------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select public.update_recurring_template(pg_temp.v('rent'), 'Rent', 9600000, 1, 1, 9, 'equal', pg_temp.everyone());
select is((select amount_minor from public.expenses where id = pg_temp.v('rent_now')), 9000000::bigint,
  'a new rent applies to later months; this month''s charge stays');

select public.set_recurring_template_paused(pg_temp.v('rent'), true);
select pg_temp.due_since(pg_temp.v('rent'), 2);
select is(pg_temp.charge(), 0, 'a paused template charges nothing');
select pg_temp.act_as(pg_temp.a());
select public.set_recurring_template_paused(pg_temp.v('rent'), false);
reset role;
select ok(
  (select private.period_bill_date(next_period, bill_day) >= pg_temp.today()
   from public.recurring_templates where id = pg_temp.v('rent')),
  'resuming skips the months it was paused');

select pg_temp.act_as(pg_temp.a());
select public.remove_member(pg_temp.v('flat'), pg_temp.j());
select pg_temp.due_since(pg_temp.v('rent'), 0);
select is(pg_temp.charge(), 1, 'the job reaches rent again');
select is(
  (select state || ':' || reason from public.recurring_instances
   where template_id = pg_temp.v('rent') and billing_period = pg_temp.this_month() and state = 'waiting'),
  null, 'this month was already charged, so nothing is opened twice');
-- Next month's bill day has not come, so charge that period directly.
select private.charge_next_period(pg_temp.v('rent'));
select is(
  (select state || ':' || reason from public.recurring_instances
   where template_id = pg_temp.v('rent') and billing_period = (pg_temp.this_month() + interval '1 month')::date),
  'waiting:split_needs_review', 'when someone in the split has left, the charge waits for an admin');

select pg_temp.act_as(pg_temp.a());
select lives_ok(
  format('select public.skip_recurring_bill(%L)', (
    select id from public.recurring_instances
    where template_id = pg_temp.v('rent') and billing_period = (pg_temp.this_month() + interval '1 month')::date)),
  'an admin can skip a period');
select lives_ok($$ select public.archive_recurring_template(pg_temp.v('rent')) $$, 'and archive a template');

select * from finish();
rollback;
