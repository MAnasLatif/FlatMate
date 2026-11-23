-- Push receipts (SRS FR-09): tickets are kept, receipts read, dead tokens deleted, errors kept.
begin;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
-- A ticket's state, or 'gone' once deleted.
create function pg_temp.ticket(p_id text) returns text language sql as $$
  select coalesce(
    (select status || coalesce(':' || error, '') from public.push_tickets where ticket_id = p_id),
    'gone')
$$;
create function pg_temp.n(i integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-00000000000' || i)::uuid
$$;

-- Anas has a flat, a phone and a tablet, and five notifications being sent.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
select public.register_push_token('ExponentPushToken[anas-phone-00001]', 'android');
select public.register_push_token('ExponentPushToken[anas-tablet-0002]', 'android');

reset role;
insert into public.notifications (id, user_id, apartment_id, type, record_type, push_status, push_attempts, push_claimed_at)
select pg_temp.n(i), pg_temp.a(), pg_temp.v('flat')::uuid, 'expense.created', 'expense', 'sending', 1, now()
from generate_series(1, 5) i;

-- Expo accepts them all, with a ticket each; the last without an id.
set local role service_role;
select public.report_pushes(jsonb_build_array(
  jsonb_build_object('notification_id', pg_temp.n(1), 'token', 'ExponentPushToken[anas-phone-00001]', 'ok', true, 'ticket_id', 'ticket-ok'),
  jsonb_build_object('notification_id', pg_temp.n(2), 'token', 'ExponentPushToken[anas-tablet-0002]', 'ok', true, 'ticket_id', 'ticket-gone'),
  jsonb_build_object('notification_id', pg_temp.n(3), 'token', 'ExponentPushToken[anas-phone-00001]', 'ok', true, 'ticket_id', 'ticket-creds'),
  jsonb_build_object('notification_id', pg_temp.n(4), 'token', 'ExponentPushToken[anas-phone-00001]', 'ok', true, 'ticket_id', 'ticket-late'),
  jsonb_build_object('notification_id', pg_temp.n(5), 'token', 'ExponentPushToken[anas-phone-00001]', 'ok', true)
));

reset role;
select is((select count(*)::int from public.push_tickets), 4, 'every accepted push with a ticket id keeps its ticket');
select is((select count(*)::int from public.notifications where push_status = 'sent' and id = pg_temp.n(5)), 1,
  'a push without a ticket id is still sent');
select ok((select bool_and(check_after > now() + interval '14 minutes') from public.push_tickets),
  'receipts are due about 15 minutes later');

set local role service_role;
select is_empty($$ select * from public.claim_push_receipts() $$, 'nothing is claimed before then');

-- Fifteen minutes pass.
reset role;
update public.push_tickets set check_after = now() - interval '1 second';
set local role service_role;
create temporary table claimed as select * from public.claim_push_receipts();
select is((select count(*)::int from claimed), 4, 'then every due ticket is claimed');
select is_empty($$ select * from public.claim_push_receipts() $$, 'and not handed out twice');

select public.report_push_receipts(jsonb_build_array(
  jsonb_build_object('ticket_id', 'ticket-ok', 'status', 'ok'),
  jsonb_build_object('ticket_id', 'ticket-gone', 'status', 'error', 'error', 'DeviceNotRegistered'),
  jsonb_build_object('ticket_id', 'ticket-creds', 'status', 'error', 'error', 'InvalidCredentials'),
  jsonb_build_object('ticket_id', 'ticket-late', 'status', 'missing'),
  jsonb_build_object('ticket_id', 'ticket-unknown', 'status', 'ok')
));

reset role;
select is(pg_temp.ticket('ticket-ok'), 'gone', 'an ok receipt needs nothing more');
select is(pg_temp.ticket('ticket-gone'), 'error:DeviceNotRegistered', 'an unregistered device is recorded');
select is(array(select token from public.push_tokens where user_id = pg_temp.a()),
  array['ExponentPushToken[anas-phone-00001]'], 'and its token is deleted, the working one kept');
select is(pg_temp.ticket('ticket-creds'), 'error:InvalidCredentials', 'a credential error is kept for maintainers');
select is(pg_temp.ticket('ticket-late'), 'pending', 'a receipt not ready yet is asked for again');
select ok((select check_after > now() + interval '14 minutes' from public.push_tickets where ticket_id = 'ticket-late'),
  'later');
select is((select count(*)::int from public.push_tickets where ticket_id = 'ticket-unknown'), 0,
  'a ticket that does not exist is ignored');

-- A receipt still missing after a day can no longer be read.
update public.push_tickets set created_at = now() - interval '25 hours', check_after = now() - interval '1 second'
where ticket_id = 'ticket-late';
-- Errors older than 30 days are cleared.
update public.push_tickets set checked_at = now() - interval '31 days' where ticket_id = 'ticket-gone';
set local role service_role;
select is_empty($$ select * from public.claim_push_receipts() $$, 'an expired ticket is not claimed');
reset role;
select is(pg_temp.ticket('ticket-late'), 'error:NoReceipt', 'it is recorded as never getting a receipt');
select is(pg_temp.ticket('ticket-gone'), 'gone', 'and old errors are cleared');

-- Clients never see or run any of it.
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select * from public.push_tickets $$, '42501', null, 'tickets are not readable by clients');

select * from finish();

rollback;
