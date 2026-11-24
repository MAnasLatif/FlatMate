-- Rooms, occupancy and splitting a bill by room (SRS FR-10.6).
begin;

select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('44444444-4444-4444-4444-444444444444', 'wali@example.test', '{"display_name": "Wali"}'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@example.test', '{"display_name": "Outsider"}');

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
create function pg_temp.y() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.w() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
-- A split as 'Name:amount:days' for those included, then 'Name:left out:days'.
create function pg_temp.split(amount bigint, from_day date, to_day date) returns text language sql as $$
  select string_agg(
    n.name || ':' || case when s.included then s.amount_minor::text else 'left out' end || ':' || s.days,
    ',' order by s.included desc, n.name)
  from public.get_room_split(pg_temp.flat(), amount, from_day, to_day) s
  join (values (pg_temp.a(), 'Anas'), (pg_temp.z(), 'Zubair'), (pg_temp.y(), 'Yasir'), (pg_temp.w(), 'Wali'))
    n (user_id, name) on n.user_id = s.user_id
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.w());
select pg_temp.join(pg_temp.v('code'));

-- Rooms ------------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('master', public.save_room(pg_temp.flat(), ' Master ', 3,
  p_request_id => 'cccccccc-0000-0000-0000-000000000001')::text);
select is(
  (select name || ':' || weight from public.rooms where id = pg_temp.v('master')::uuid),
  'Master:3', 'an admin adds a room with its weight');
select is(
  public.save_room(pg_temp.flat(), 'Master', 3, p_request_id => 'cccccccc-0000-0000-0000-000000000001')::text,
  pg_temp.v('master'), 'a retried add returns the same room');
insert into vals values ('small', public.save_room(pg_temp.flat(), 'Small', 2)::text);
insert into vals values ('box', public.save_room(pg_temp.flat(), 'Box room', 1)::text);
select throws_ok(
  $$ select public.save_room(pg_temp.flat(), 'MASTER', 1) $$,
  '23505', 'room_name_taken', 'two rooms in use cannot share a name');
select throws_ok(
  $$ select public.save_room(pg_temp.flat(), 'Attic', 0) $$,
  '22023', 'invalid_room_weight', 'a weight is 1 to 100');
select throws_ok(
  $$ select public.save_room(pg_temp.flat(), '  ', 1) $$,
  '22023', 'invalid_room_name', 'a room needs a name');

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.save_room(pg_temp.flat(), 'Attic', 1) $$,
  '42501', 'admin_required', 'only admins manage rooms');
select is((select count(*)::int from public.rooms), 3, 'members see the rooms');
select pg_temp.act_as(pg_temp.o());
select is((select count(*)::int from public.rooms), 0, 'outsiders do not');

-- Occupancy --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('anas_master', public.add_room_occupant(pg_temp.v('master')::uuid, pg_temp.a(), '2026-11-01')::text);
insert into vals values ('zubair_small', public.add_room_occupant(pg_temp.v('small')::uuid, pg_temp.z(), '2026-11-01')::text);
insert into vals values ('yasir_small', public.add_room_occupant(pg_temp.v('small')::uuid, pg_temp.y(), '2026-11-01')::text);
insert into vals values ('wali_box', public.add_room_occupant(pg_temp.v('box')::uuid, pg_temp.w(), '2026-11-01', '2026-11-10')::text);
select is((select count(*)::int from public.room_occupancies), 4, 'an admin records who lives in each room');

select throws_ok(
  $$ select public.add_room_occupant(pg_temp.v('box')::uuid, pg_temp.z(), '2026-11-20') $$,
  '22023', 'occupancy_overlaps', 'nobody is in two rooms on the same day');
select throws_ok(
  $$ select public.add_room_occupant(pg_temp.v('box')::uuid, pg_temp.o(), '2026-11-20') $$,
  '22023', 'occupant_not_member', 'only members live in a room');
select throws_ok(
  $$ select public.add_room_occupant(pg_temp.v('box')::uuid, pg_temp.w(), '2026-11-20', '2026-11-19') $$,
  '22023', 'invalid_occupancy_dates', 'an occupancy ends on or after its start');

-- The first split: Anas alone in Master (3), Zubair and Yasir sharing Small (2).
select is(pg_temp.split(300000, '2026-11-01', '2026-11-05'),
  'Anas:150000:5,Wali:50000:5,Yasir:50000:5,Zubair:50000:5',
  'by weight: Master 3, Small 2 shared by its two people, Box 1');

-- Yasir moves out of Small after 15 November.
select public.end_room_occupancy(pg_temp.v('yasir_small')::uuid, '2026-11-15');
select throws_ok(
  format($$ select public.end_room_occupancy(%L, '2026-11-20') $$, pg_temp.v('yasir_small')),
  '22023', 'occupancy_already_ended', 'an occupancy ends once');
select throws_ok(
  format($$ select public.end_room_occupancy(%L, '2026-10-01') $$, pg_temp.v('zubair_small')),
  '22023', 'invalid_occupancy_dates', 'and not before it started');

-- Wali leaves the flat: his days are left out and Box counts as empty.
select pg_temp.act_as(pg_temp.w());
select public.leave_apartment(pg_temp.flat());
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.split(300000, '2026-11-01', '2026-11-30'),
  'Anas:180000:30,Yasir:30000:15,Zubair:90000:30,Wali:left out:10',
  'by weight and days: Zubair has Small alone after Yasir left, and a former member''s days are left out');
select is(
  (select sum(amount_minor)::bigint from public.get_room_split(pg_temp.flat(), 300000, '2026-11-01', '2026-11-30')),
  300000::bigint, 'any member can work out a split, and it adds up');
select is(pg_temp.split(100001, '2026-11-01', '2026-11-30'),
  'Anas:60001:30,Yasir:10000:15,Zubair:30000:30,Wali:left out:10',
  'the leftover unit goes to the largest remainder');
select is(pg_temp.split(7, '2026-11-01', '2026-11-01'),
  'Anas:4:1,Yasir:1:1,Zubair:2:1,Wali:left out:1',
  'tiny amounts still add up: of 4.2, 1.4 and 1.4 the tie for the last unit goes in user id order');
select is(pg_temp.split(50000, '2026-12-01', '2026-12-31'),
  'Anas:30000:31,Zubair:20000:31', 'an empty room takes no part');
select is(pg_temp.split(10000, '2026-10-25', '2026-11-01'),
  'Anas:6000:1,Yasir:2000:1,Zubair:2000:1,Wali:left out:1', 'days nobody lived anywhere count for nothing');

select throws_ok(
  $$ select public.get_room_split(pg_temp.flat(), 1000, '2026-10-01', '2026-10-31') $$,
  '22023', 'no_occupants', 'a period nobody lived in cannot be split by room');
select throws_ok(
  $$ select public.get_room_split(pg_temp.flat(), 1000, '2026-11-30', '2026-11-01') $$,
  '22023', 'invalid_period', 'a period ends on or after it starts');
select throws_ok(
  $$ select public.get_room_split(pg_temp.flat(), 1000, '2026-01-01', '2027-01-02') $$,
  '22023', 'period_too_long', 'a period is at most a year');
select throws_ok(
  $$ select public.get_room_split(pg_temp.flat(), 0, '2026-11-01', '2026-11-30') $$,
  '22023', 'invalid_total', 'an amount is more than nothing');
select pg_temp.act_as(pg_temp.o());
select throws_ok(
  $$ select public.get_room_split(pg_temp.flat(), 1000, '2026-11-01', '2026-11-30') $$,
  '42501', 'not_member', 'outsiders cannot work out a split');

-- The split posts as a split by amount, and a later change of rooms leaves it alone.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('rent', public.post_expense(pg_temp.flat(), 'November rent', 300000, '2026-11-30', 'fixed',
  (select jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor))
   from public.get_room_split(pg_temp.flat(), 300000, '2026-11-01', '2026-11-30') where included),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 300000)))::text);
select public.save_room(pg_temp.flat(), 'Master', 5, pg_temp.v('master')::uuid);
select is(
  (select string_agg(amount_minor::text, ',' order by amount_minor desc) from public.expense_splits
   where expense_id = pg_temp.v('rent')::uuid),
  '180000,90000,30000', 'a posted split keeps its amounts when a room''s weight changes');

-- Correcting and archiving
select public.remove_room_occupancy(pg_temp.v('yasir_small')::uuid);
select is((select count(*)::int from public.room_occupancies where user_id = pg_temp.y()), 0,
  'an admin removes an occupancy entered by mistake');
select throws_ok(
  format($$ select public.archive_room(%L) $$, pg_temp.v('small')),
  '22023', 'room_occupied', 'a room someone lives in cannot be archived');
select public.archive_room(pg_temp.v('box')::uuid);
select is((select archived_at is not null from public.rooms where id = pg_temp.v('box')::uuid), true,
  'an empty room is archived');
select throws_ok(
  format($$ select public.add_room_occupant(%L, %L, '2026-12-01') $$, pg_temp.v('box'), pg_temp.y()),
  '22023', 'room_archived', 'and nobody moves into it');
select is(pg_temp.split(10000, '2026-11-01', '2026-11-01'),
  'Anas:7143:1,Zubair:2857:1,Wali:left out:1', 'an archived room''s past still counts');

select throws_ok(
  $$ insert into public.rooms (apartment_id, name) values (pg_temp.flat(), 'Attic') $$,
  '42501', null, 'nobody writes the tables directly');

select is(
  (select string_agg(action || ':' || subject, ',' order by id)
   from public.get_activity(pg_temp.flat(), 'settings') where entity_type = 'room'
     and action in ('created', 'occupancy_ended', 'archived')),
  'created:Master,created:Small,created:Box room,occupancy_ended:Small,archived:Box room',
  'room changes are in the timeline under settings');

select * from finish();
rollback;
