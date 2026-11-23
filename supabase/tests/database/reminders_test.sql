-- Reminders (SRS FR-09.1, FR-09.2, FR-09.4): who is reminded, when, and only once.
begin;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}');

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
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.told(p_user uuid, p_type text) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and type = p_type
$$;

-- The job depends on the hour in the apartment's timezone, so the test picks
-- a zone where it is now daytime (after 09:00), and one where it is night.
insert into vals
select 'day_zone', min(name) from pg_timezone_names
where name like 'Etc/GMT%' and (now() at time zone name)::time between time '10:00' and time '20:00';
insert into vals
select 'night_zone', min(name) from pg_timezone_names
where name like 'Etc/GMT%' and (now() at time zone name)::time between time '01:00' and time '07:00';

-- Anas creates the flat; Zubair and Ajmal join.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join(pg_temp.v('code'));

reset role;
update public.apartments set timezone = pg_temp.v('day_zone') where id = pg_temp.v('flat')::uuid;
insert into vals values ('today', (now() at time zone pg_temp.v('day_zone'))::date::text);
create function pg_temp.today() returns date language sql as $$ select pg_temp.v('today')::date $$;

select is(
  (select due_reminder_days::text || '/' || settlement_reminder_days from public.apartments where id = pg_temp.v('flat')::uuid),
  '1/2', 'an apartment reminds a day before a due date and two days before settlement');

-- The schedule ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.update_apartment_reminders(pg_temp.v('flat')::uuid, 3, 3) $$,
  '42501', 'not_admin', 'only an admin sets the schedule');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.update_apartment_reminders(pg_temp.v('flat')::uuid, 15, 3) $$,
  '22023', 'invalid_due_reminder_days', 'a due-date reminder is at most 14 days before');
select throws_ok($$ select public.update_apartment_reminders(pg_temp.v('flat')::uuid, 1, 0) $$,
  '22023', 'invalid_settlement_reminder_days', 'a settlement reminder is at least a day before');
select public.update_apartment_reminders(pg_temp.v('flat')::uuid, null, null);
reset role;
select is(
  (select count(*)::int from public.audit_events where apartment_id = pg_temp.v('flat')::uuid and action = 'reminders_changed'),
  1, 'a change is recorded');

-- Bills: Zubair will pay the internet, due tomorrow; nobody is named for the
-- electricity, due today; the gas is due in a week.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('internet', public.post_expense(
  p_apartment_id => pg_temp.v('flat')::uuid, p_title => 'Internet', p_amount_minor => 40000,
  p_expense_date => pg_temp.today(), p_split_method => 'equal',
  p_participants => jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  p_payers => '[]'::jsonb, p_due_date => pg_temp.today() + 1, p_collector_id => pg_temp.z())::text);
insert into vals values ('electricity', public.post_expense(
  p_apartment_id => pg_temp.v('flat')::uuid, p_title => 'Electricity', p_amount_minor => 90000,
  p_expense_date => pg_temp.today(), p_split_method => 'equal',
  p_participants => jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  p_payers => '[]'::jsonb, p_due_date => pg_temp.today())::text);
select public.post_expense(
  p_apartment_id => pg_temp.v('flat')::uuid, p_title => 'Gas', p_amount_minor => 30000,
  p_expense_date => pg_temp.today(), p_split_method => 'equal',
  p_participants => jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  p_payers => '[]'::jsonb, p_due_date => pg_temp.today() + 7);

reset role;
select is(private.send_due_reminders(), 0, 'with reminders off, nothing is sent');

select pg_temp.act_as(pg_temp.a());
select public.update_apartment_reminders(pg_temp.v('flat')::uuid, 1, 2);
reset role;
select private.send_due_reminders();

select is(
  (select record_type || ':' || record_id from public.notifications where user_id = pg_temp.z() and type = 'reminder.bill_due_soon'),
  'expense:' || pg_temp.v('internet'), 'the collector is reminded the day before, and it opens the bill');
select is(pg_temp.told(pg_temp.a(), 'reminder.bill_due_soon'), 0, 'the admin is not, since someone is paying it');
select is(
  (select record_id::text from public.notifications where user_id = pg_temp.a() and type = 'reminder.bill_due_today'),
  pg_temp.v('electricity'), 'a bill nobody is paying reminds the admin on the day');
select is(pg_temp.told(pg_temp.z(), 'reminder.bill_due_today'), 0, 'and not the members who share it');
select is(
  (select count(*)::int from public.notifications where type like 'reminder.bill%' and record_id not in
    (pg_temp.v('internet')::uuid, pg_temp.v('electricity')::uuid)),
  0, 'a bill due beyond the schedule waits');
select is(private.send_due_reminders(), 0, 'running the job again sends nothing twice');
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'user:' || pg_temp.z() and payload ->> 'kind' = 'notification' $$,
  'the person''s devices are told');

-- Once paid, a bill is never reminded of again.
select pg_temp.act_as(pg_temp.z());
select public.record_bill_payment(pg_temp.v('internet')::uuid,
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 40000)));
reset role;
delete from public.notifications where record_id = pg_temp.v('internet')::uuid and type like 'reminder.%';
select private.send_due_reminders();
select is(pg_temp.told(pg_temp.z(), 'reminder.bill_due_soon'), 0, 'a paid bill is not reminded');

-- Settlement: Anas paid groceries shared with Zubair, so Zubair owes Anas more
-- than the internet bill Zubair paid; Anas also paid a repair shared with
-- Ajmal, who disputes it. The period ends tomorrow.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat')::uuid, 'Groceries', 100000, pg_temp.today(), 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 100000)));
insert into vals values ('repair', public.post_expense(pg_temp.v('flat')::uuid, 'Repair', 20000, pg_temp.today(), 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.j())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)))::text);
select pg_temp.act_as(pg_temp.j());
select public.raise_dispute(pg_temp.v('repair')::uuid, 'adjustment', 'I was away', 5000);

reset role;
update public.settlement_periods set ends_on = pg_temp.today() + 1
where apartment_id = pg_temp.v('flat')::uuid and state = 'open';
select private.send_due_reminders();

select is(
  (select record_type from public.notifications where user_id = pg_temp.z() and type = 'reminder.settlement_soon'),
  'settlement', 'a member who owes is reminded before the settlement day, and it opens the settlement');
select is(pg_temp.told(pg_temp.a(), 'reminder.settlement_soon'), 0, 'a member who is only owed is not');
select is(pg_temp.told(pg_temp.j(), 'reminder.settlement_soon'), 0, 'nor one whose only debt is disputed');

-- Before 09:00 in the apartment's timezone, nothing goes out.
update public.apartments set timezone = pg_temp.v('night_zone') where id = pg_temp.v('flat')::uuid;
update public.settlement_periods set ends_on = (now() at time zone pg_temp.v('night_zone'))::date + 1
where apartment_id = pg_temp.v('flat')::uuid and state = 'open';
delete from public.notifications where type like 'reminder.%';
select is(private.send_due_reminders(), 0, 'reminders never go out in the night');

select * from finish();

rollback;
