-- Admin tools for former members: hiding one from the list, and inviting one
-- back without a code (decided 2026-11-15).
begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'arsal@example.test', '{"display_name": "Arsal"}'),
  ('44444444-4444-4444-4444-444444444444', 'sara@example.test', '{"display_name": "Sara"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.r() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.s() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.is_member(person uuid) returns boolean language sql as $$
  select exists (select 1 from public.apartment_members
                 where apartment_id = pg_temp.flat() and user_id = person and left_at is null)
$$;

-- Anas creates Flat 4B; Zubair and Arsal join; Arsal leaves. Sara never joined.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
insert into vals values ('zr', public.join_apartment(pg_temp.v('code')) ->> 'request_id');
select pg_temp.act_as(pg_temp.r());
insert into vals values ('rr', public.join_apartment(pg_temp.v('code')) ->> 'request_id');
select pg_temp.act_as(pg_temp.a());
select public.approve_join_request(pg_temp.v('zr')::uuid);
select public.approve_join_request(pg_temp.v('rr')::uuid);
select pg_temp.act_as(pg_temp.r());
select public.leave_apartment(pg_temp.flat());

-- Hiding --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.hide_former_member(pg_temp.flat(), pg_temp.r()) $$,
  '42501', 'not_admin', 'a member who is not an admin cannot hide anyone');

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.hide_former_member(pg_temp.flat(), pg_temp.z()) $$,
  '22023', 'still_a_member', 'a current member cannot be hidden');
select throws_ok($$ select public.hide_former_member(pg_temp.flat(), pg_temp.s()) $$,
  'P0002', 'member_not_found', 'nor someone who was never a member');

select lives_ok($$ select public.hide_former_member(pg_temp.flat(), pg_temp.r()) $$,
  'an admin hides a former member');
select is(
  (select hidden_at is not null from public.apartment_members
   where apartment_id = pg_temp.flat() and user_id = pg_temp.r()),
  true, 'the membership is marked hidden');
select lives_ok($$ select public.hide_former_member(pg_temp.flat(), pg_temp.r()) $$,
  'hiding again is not an error');
select is(
  (select count(*)::int from public.audit_events
   where apartment_id = pg_temp.flat() and entity_type = 'member' and action = 'hidden'
     and actor_id = pg_temp.a() and entity_id = pg_temp.r()),
  1, 'and is recorded once, with who hid them');

-- Hiding changes nothing else: Zubair still sees Arsal's membership, for names on old records.
select pg_temp.act_as(pg_temp.z());
select is(
  (select count(*)::int from public.apartment_members
   where apartment_id = pg_temp.flat() and user_id = pg_temp.r()),
  1, 'the hidden membership is still readable by members');

reset role;
select is(
  (select count(*)::int from public.notifications where type like 'member.hidden%'),
  0, 'nobody is notified about hiding');

-- Inviting back ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.invite_back(pg_temp.flat(), pg_temp.r()) $$,
  '42501', 'not_admin', 'a member who is not an admin cannot invite anyone back');

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.invite_back(pg_temp.flat(), pg_temp.z()) $$,
  '22023', 'already_member', 'a current member cannot be invited back');
select throws_ok($$ select public.invite_back(pg_temp.flat(), pg_temp.s()) $$,
  'P0002', 'not_former_member', 'only a former member can be invited back');

insert into vals values ('invite', public.invite_back(pg_temp.flat(), pg_temp.r())::text);
select is(public.invite_back(pg_temp.flat(), pg_temp.r())::text, pg_temp.v('invite'),
  'inviting again while one waits returns the same invitation');
select results_eq(
  $$ select user_id from public.get_rejoin_invites(pg_temp.flat()) $$,
  $$ values (pg_temp.r()) $$,
  'admins see the waiting invitation');

reset role;
select is(
  (select record_type || ':' || record_id::text from public.notifications
   where user_id = pg_temp.r() and type = 'rejoin_invite.sent'),
  'rejoin_invite:' || pg_temp.v('invite'),
  'the person invited is told once, pointing at the invitation');

select pg_temp.act_as(pg_temp.r());
select results_eq(
  $$ select apartment_name, invited_by_name from public.get_my_rejoin_invites() $$,
  $$ values ('Flat 4B'::text, 'Anas'::text) $$,
  'they see the invitation with the apartment and who invited them');
select throws_ok($$ select * from public.get_rejoin_invites(pg_temp.flat()) $$,
  '42501', 'not_admin', 'but not the apartment''s list of invitations');
select throws_ok($$ select public.cancel_rejoin_invite(pg_temp.v('invite')::uuid) $$,
  'P0002', 'invite_not_found', 'and cannot cancel it as if they were an admin');

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.accept_rejoin_invite(pg_temp.v('invite')::uuid) $$,
  'P0002', 'invite_not_found', 'nobody else can accept it');

select pg_temp.act_as(pg_temp.r());
select is(public.accept_rejoin_invite(pg_temp.v('invite')::uuid), pg_temp.flat(),
  'accepting answers with the apartment');
select is(pg_temp.is_member(pg_temp.r()), true, 'and makes them a member again');
select throws_ok($$ select public.accept_rejoin_invite(pg_temp.v('invite')::uuid) $$,
  '22023', 'invite_not_pending', 'an answered invitation cannot be answered again');

reset role;
select is(
  (select count(*)::int from public.notifications n
   join public.audit_events e on e.id = n.audit_event_id
   where n.user_id = pg_temp.a() and n.type = 'member.joined'
     and e.details ->> 'rejoin_invite_id' = pg_temp.v('invite')),
  1, 'the admins are told they joined through the invitation');

-- Declining and cancelling ------------------------------------------------------------------

select pg_temp.act_as(pg_temp.r());
select public.leave_apartment(pg_temp.flat());
select pg_temp.act_as(pg_temp.a());
insert into vals values ('second', public.invite_back(pg_temp.flat(), pg_temp.r())::text);
select pg_temp.act_as(pg_temp.r());
select public.decline_rejoin_invite(pg_temp.v('second')::uuid);
select is(pg_temp.is_member(pg_temp.r()), false, 'declining leaves them a former member');

reset role;
select is(
  (select count(*)::int from public.notifications
   where user_id = pg_temp.a() and type = 'rejoin_invite.declined'),
  1, 'and the admin who invited is told');

select pg_temp.act_as(pg_temp.a());
insert into vals values ('third', public.invite_back(pg_temp.flat(), pg_temp.r())::text);
select public.cancel_rejoin_invite(pg_temp.v('third')::uuid);
select pg_temp.act_as(pg_temp.r());
select is((select count(*)::int from public.get_my_rejoin_invites()), 0,
  'a cancelled invitation is no longer offered');

select throws_ok($$ select * from public.rejoin_invites $$, '42501', null,
  'invitations are reached only through the functions that check who is asking');

select * from finish();
rollback;
