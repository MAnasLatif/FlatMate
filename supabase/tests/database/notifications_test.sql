-- Notifications (SRS FR-09.1, FR-09.3): who is told, what they can read, and push delivery.
begin;

select plan(30);

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
-- Notifications for one person, read as the database owner.
create function pg_temp.told(p_user uuid, p_type text) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and type = p_type
$$;

-- Anas creates the flat; Zubair and Ajmal join.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join(pg_temp.v('code'));

reset role;
select is(pg_temp.told(pg_temp.a(), 'member.joined'), 2, 'the admin hears about each person joining');
select is(pg_temp.told(pg_temp.z(), 'member.joined'), 0, 'a member who is not an admin does not');

-- Anas pays for internet shared with Zubair; Ajmal is not part of it.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('internet', public.post_expense(pg_temp.v('flat')::uuid, 'Internet', 40000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 40000)))::text);

reset role;
select is(pg_temp.told(pg_temp.z(), 'expense.created'), 1, 'someone sharing a new expense is told');
select is(pg_temp.told(pg_temp.a(), 'expense.created'), 0, 'the person who added it is not');
select is(pg_temp.told(pg_temp.j(), 'expense.created'), 0, 'nor someone the expense does not include');
select is(
  (select record_type || ':' || record_id from public.notifications where user_id = pg_temp.z() and type = 'expense.created'),
  'expense:' || pg_temp.v('internet'),
  'it opens the expense');
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'user:' || pg_temp.z() and payload ->> 'kind' = 'notification' $$,
  'and tells the person''s devices their inbox changed');

-- The inbox is private.
select pg_temp.act_as(pg_temp.z());
select is((select count(*)::int from public.notifications), 2,
  'a person reads their own notifications: their approved join request and the expense');
select throws_ok($$ select push_status from public.notifications $$, '42501', null,
  'but not the push delivery columns');
select throws_ok(
  $$ insert into public.notifications (user_id, apartment_id, type, record_type) values (pg_temp.z(), pg_temp.v('flat')::uuid, 'expense.created', 'expense') $$,
  '42501', null, 'and cannot create notifications');
select pg_temp.act_as(pg_temp.j());
select is_empty($$ select 1 from public.notifications where type = 'expense.created' $$,
  'nobody reads someone else''s notifications');

select pg_temp.act_as(pg_temp.z());
select is(public.mark_notifications_read(), 2, 'marking all read marks the unread ones');
select is(public.mark_notifications_read(), 0, 'and marking again changes nothing');
select isnt((select read_at from public.notifications limit 1), null, 'it is now read');

-- Payments go to the other party, and opening one lands on the payment.
select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.v('flat')::uuid, pg_temp.a(), 20000)::text);
reset role;
select is(
  (select record_type || ':' || record_id from public.notifications where user_id = pg_temp.a() and type = 'payment.recorded'),
  'payment:' || pg_temp.v('payment'),
  'the recipient is told about a recorded payment, which it opens');

select pg_temp.act_as(pg_temp.a());
select public.decline_payment(pg_temp.v('payment')::uuid, 'Not received');
reset role;
select is(pg_temp.told(pg_temp.z(), 'payment.declined'), 1, 'the payer is told when it is declined');

-- A dispute opens the dispute.
select pg_temp.act_as(pg_temp.z());
insert into vals values ('dispute', public.raise_dispute(pg_temp.v('internet')::uuid, 'adjustment', 'I was away', 10000)::text);
reset role;
select is(
  (select record_type || ':' || record_id from public.notifications where user_id = pg_temp.a() and type = 'expense.dispute_raised'),
  'dispute:' || pg_temp.v('dispute'),
  'the expense''s people are told about a dispute, which it opens');

-- A removed member is told, though no longer a member.
select pg_temp.act_as(pg_temp.a());
select public.remove_member(pg_temp.v('flat')::uuid, pg_temp.j());
reset role;
select is(
  (select record_type from public.notifications where user_id = pg_temp.j() and type = 'member.you_were_removed'),
  'apartment', 'a removed member is told, and lands on the apartment');

-- Push tokens.
select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.register_push_token('ExponentPushToken[zubair-phone-0001]', 'android') $$,
  'a device registers its push token');
select public.register_push_token('ExponentPushToken[zubair-tablet-0002]', 'android');
select throws_ok($$ select public.register_push_token('not a token', 'android') $$, '22023', 'invalid_push_token',
  'a malformed token is refused');
select throws_ok($$ select token from public.push_tokens $$, '42501', null, 'tokens are never readable by clients');
select throws_ok($$ select * from public.claim_pushes() $$, '42501', null, 'and clients cannot run delivery');

-- Delivery, as the Edge Function does it.
set local role service_role;
create temporary table claimed as select * from public.claim_pushes(100);
select is(
  (select count(distinct notification_id)::int from claimed where notification_id in (select id from public.notifications where user_id = pg_temp.z())),
  (select count(*)::int from public.notifications where user_id = pg_temp.z()),
  'every notification for someone with a device is claimed for it');
select is_empty(
  $$ select 1 from claimed where body ~* '(anas|zubair|internet|400|200|flat 4b)' $$,
  'push text never names people, records, apartments or amounts');
select is(
  (select count(*)::int from public.notifications where user_id = pg_temp.a() and push_status = 'skipped' and push_error = 'no_device'),
  (select count(*)::int from public.notifications where user_id = pg_temp.a()),
  'notifications for someone without a device are skipped');
select is_empty($$ select * from public.claim_pushes(100) $$, 'claimed notifications are not handed out twice');

-- Report: the phone accepts the first; the old tablet is gone; the second is rate limited.
insert into vals select 'first', notification_id::text from (select distinct notification_id from claimed) c order by 1 limit 1;
insert into vals select 'second', notification_id::text from (select distinct notification_id from claimed) c order by 1 offset 1 limit 1;
select public.report_pushes(jsonb_build_array(
  jsonb_build_object('notification_id', pg_temp.v('first'), 'token', 'ExponentPushToken[zubair-phone-0001]', 'ok', true),
  jsonb_build_object('notification_id', pg_temp.v('first'), 'token', 'ExponentPushToken[zubair-tablet-0002]', 'ok', false, 'error', 'DeviceNotRegistered'),
  jsonb_build_object('notification_id', pg_temp.v('second'), 'token', 'ExponentPushToken[zubair-phone-0001]', 'ok', false, 'error', 'MessageRateExceeded')
));
select is((select push_status from public.notifications where id = pg_temp.v('first')::uuid), 'sent',
  'a push one device accepted is sent, though another device is gone');
select is(
  (select push_status || ':' || push_error from public.notifications where id = pg_temp.v('second')::uuid),
  'failed:MessageRateExceeded', 'a failed push records only the error code');
select ok((select push_next_attempt_at > now() from public.notifications where id = pg_temp.v('second')::uuid),
  'and is retried later, not at once');

reset role;
select is(array(select token from public.push_tokens), array['ExponentPushToken[zubair-phone-0001]'],
  'a token Expo no longer knows is deleted, and the working one kept');

select * from finish();

rollback;
