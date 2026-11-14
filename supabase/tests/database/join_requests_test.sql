-- Asking to join with a code, and an admin approving or declining (SRS FR-02.2).
begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'sara@example.test', '{"display_name": "Sara"}'),
  ('55555555-5555-5555-5555-555555555555', 'bilal@example.test', '{"display_name": "Bilal"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.s() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create function pg_temp.b() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.is_member(person uuid) returns boolean language sql as $$
  select exists (select 1 from public.apartment_members
                 where apartment_id = pg_temp.flat() and user_id = person and left_at is null)
$$;
create function pg_temp.told(person uuid, kind text) returns integer language sql as $$
  select count(*)::int from public.notifications where user_id = person and type = kind
$$;

-- Anas creates Flat 4B and a code. Ajmal joins and is made a second admin.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.j());
insert into vals values ('ajmal_request', public.join_apartment(pg_temp.v('code')) ->> 'request_id');
select pg_temp.act_as(pg_temp.a());
select public.approve_join_request(pg_temp.v('ajmal_request')::uuid);
select public.set_member_role(pg_temp.flat(), pg_temp.j(), 'admin');

-- Asking -------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(
  (select row(r ->> 'status', r ->> 'apartment_name')::text
   from (select public.join_apartment(pg_temp.v('code')) as r) as joined),
  row('requested', 'Flat 4B')::text,
  'a valid code asks to join, naming the apartment');
insert into vals values ('zubair_request',
  (select id::text from public.get_my_join_requests() where apartment_id = pg_temp.flat()));
select results_eq(
  $$ select apartment_name from public.get_my_join_requests() $$,
  $$ values ('Flat 4B'::text) $$,
  'the person sees their pending request with the apartment''s name');
select is(pg_temp.is_member(pg_temp.z()), false, 'they are not a member yet');
select throws_ok($$ select * from public.get_join_requests(pg_temp.flat()) $$,
  '42501', 'not_admin', 'and cannot see the apartment''s requests');
select throws_ok($$ select public.approve_join_request(pg_temp.v('zubair_request')::uuid) $$,
  'P0002', 'request_not_found', 'nor approve their own request');

reset role;
select is(
  (select count(*)::int from public.notifications
   where type = 'join_request.requested' and record_id = pg_temp.v('zubair_request')::uuid
     and user_id in (pg_temp.a(), pg_temp.j())),
  2, 'both admins are told about the request');
select is(
  (select count(*)::int from public.notifications
   where type = 'join_request.requested' and record_id = pg_temp.v('zubair_request')::uuid
     and user_id = pg_temp.z()),
  0, 'the person asking is not');
select is(
  (select record_type from public.notifications
   where user_id = pg_temp.a() and record_id = pg_temp.v('zubair_request')::uuid),
  'members', 'the notification opens the members screen');
select isnt_empty(
  $$ select 1 from realtime.messages where topic = 'apartment:' || pg_temp.v('flat') and payload ->> 'kind' = 'join_request' $$,
  'the apartment''s screens are told a request changed');

-- Approving ----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select results_eq(
  $$ select user_id, display_name from public.get_join_requests(pg_temp.flat()) $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid, 'Zubair'::text) $$,
  'an admin sees who is asking');

select pg_temp.act_as(pg_temp.j());
select lives_ok($$ select public.approve_join_request(pg_temp.v('zubair_request')::uuid) $$,
  'any admin can approve');
select is(pg_temp.is_member(pg_temp.z()), true, 'and the person becomes a member');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.decline_join_request(pg_temp.v('zubair_request')::uuid) $$,
  '22023', 'request_not_pending', 'the first admin to act decides; a second decision is refused');
select is_empty($$ select * from public.get_join_requests(pg_temp.flat()) $$,
  'a decided request leaves the list');

reset role;
select is(pg_temp.told(pg_temp.z(), 'join_request.approved'), 1, 'the person is told they were approved');
select is(
  (select record_type || ':' || record_id from public.notifications where user_id = pg_temp.z() and type = 'join_request.approved'),
  'apartment:' || pg_temp.v('flat'), 'and it opens the apartment');
select is(
  (select actor_id from public.audit_events where entity_type = 'member' and action = 'joined' and entity_id = pg_temp.z()),
  pg_temp.z(), 'the history records them joining, by themselves');

-- Declining and asking again ------------------------------------------------------------

select pg_temp.act_as(pg_temp.s());
insert into vals values ('sara_request', public.join_apartment(pg_temp.v('code')) ->> 'request_id');
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.decline_join_request(pg_temp.v('sara_request')::uuid) $$,
  'P0002', 'request_not_found', 'a member who is not an admin cannot decide');
select pg_temp.act_as(pg_temp.a());
select lives_ok($$ select public.decline_join_request(pg_temp.v('sara_request')::uuid) $$,
  'an admin declines');
select is(pg_temp.is_member(pg_temp.s()), false, 'a declined person does not join');
reset role;
select is(
  (select record_type from public.notifications where user_id = pg_temp.s() and type = 'join_request.declined'),
  'join_request', 'they are told, and it does not open the apartment');

select pg_temp.act_as(pg_temp.s());
select is_empty($$ select * from public.get_my_join_requests() $$, 'their request is no longer pending');
select is(public.join_apartment(pg_temp.v('code')) ->> 'status', 'requested',
  'after a decline they can ask again with a valid code');

-- Cancelling ----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.b());
insert into vals values ('bilal_request', public.join_apartment(pg_temp.v('code')) ->> 'request_id');
select pg_temp.act_as(pg_temp.s());
select throws_ok($$ select public.cancel_join_request(pg_temp.v('bilal_request')::uuid) $$,
  'P0002', 'request_not_found', 'nobody cancels someone else''s request');
select pg_temp.act_as(pg_temp.b());
select lives_ok($$ select public.cancel_join_request(pg_temp.v('bilal_request')::uuid) $$,
  'the person cancels their own request');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.approve_join_request(pg_temp.v('bilal_request')::uuid) $$,
  '22023', 'request_not_pending', 'a cancelled request cannot be approved');

-- Nobody reads requests directly.
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select * from public.join_requests $$, '42501', null,
  'requests are reached only through the functions that check who is asking');

select * from finish();
rollback;
