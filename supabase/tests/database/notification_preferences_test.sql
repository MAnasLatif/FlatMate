-- Notification preferences (SRS FR-01.2, FR-09.2): turning push off by group.
begin;

select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;

-- Every type the database creates belongs to a group someone can turn off.
select is(private.notification_category('expense.created'), 'expenses', 'an expense change is in expenses');
select is(private.notification_category('recurring_bill.amount_needed'), 'expenses', 'and so is a waiting repeatable bill');
select is(private.notification_category('expense.dispute_raised'), 'disputes', 'a dispute is in disputes, not expenses');
select is(private.notification_category('offset.netted_off'), 'payments', 'netting off is with payments');
select is(private.notification_category('join_request.requested'), 'members', 'a request to join is with members');
select is(private.notification_category('reminder.bill_due_soon'), 'reminders', 'a reminder is in reminders');
select is(private.notification_category('settlement_period.closed'), 'settlement', 'a closed period is in settlement');
select is_empty(
  $$ select 1 from public.notifications where private.notification_category(type) is null $$,
  'no stored notification is left without a group');

-- Setting preferences.
select pg_temp.act_as(pg_temp.z());
select public.set_notification_push('expenses', false);
select is(array(select category from public.notification_mutes), array['expenses'],
  'a person turns a group off, and reads it back');
select lives_ok($$ select public.set_notification_push('expenses', false) $$, 'turning it off again is harmless');
select throws_ok($$ select public.set_notification_push('everything', false) $$, '22023', 'invalid_category',
  'an unknown group is refused');
select throws_ok(
  $$ insert into public.notification_mutes (user_id, category) values (pg_temp.z(), 'payments') $$,
  '42501', null, 'the table is written only through the function');
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'user:' || pg_temp.z() and payload ->> 'kind' = 'notification_preference' $$,
  'the person''s other devices are told');

select pg_temp.act_as(pg_temp.a());
select is_empty($$ select 1 from public.notification_mutes $$, 'nobody reads someone else''s preferences');

-- A muted group's push is skipped; the notification stays for the red dot.
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
select pg_temp.act_as(pg_temp.z());
select public.register_push_token('ExponentPushToken[zubair-phone-0001]', 'android');

reset role;
insert into public.notifications (user_id, apartment_id, type, record_type)
select pg_temp.z(), val::uuid, t.type, t.record_type
from vals, (values ('expense.created', 'expense'), ('payment.recorded', 'payment')) t(type, record_type)
where name = 'flat';

-- Anything else waiting, such as data left in a local database, is set aside.
update public.notifications set push_status = 'sent' where user_id <> pg_temp.z();

set local role service_role;
create temporary table claimed as select * from public.claim_pushes(100);
reset role;
select is(
  (select push_status || ':' || push_error from public.notifications where user_id = pg_temp.z() and type = 'expense.created'),
  'skipped:muted', 'a push in a group turned off is skipped as muted');
select is(
  (select count(*)::int from claimed c join public.notifications n on n.id = c.notification_id where n.type = 'payment.recorded'),
  1, 'a push in a group left on is still sent');

select * from finish();

rollback;
