-- Managing members: roles, the expense permission, removal and leaving, with
-- the rule that an apartment keeps at least one admin.
begin;

select plan(19);

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

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite((select val::uuid from vals where name = 'flat')));

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select public.join_apartment((select val from vals where name = 'code'));

create function pg_temp.flat() returns uuid language sql as $$ select val::uuid from vals where name = 'flat' $$;
create function pg_temp.role_of(user_id uuid) returns text language sql as $$
  select role from public.apartment_members where apartment_id = pg_temp.flat() and user_id = $1 and left_at is null
$$;

-- Members who are not admins ------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ select public.set_member_role(pg_temp.flat(), '33333333-3333-3333-3333-333333333333', 'admin') $$,
  '42501', 'not_admin',
  'a member cannot make someone an admin'
);
select throws_ok(
  $$ select public.set_member_can_add_expense(pg_temp.flat(), '33333333-3333-3333-3333-333333333333', false) $$,
  '42501', 'not_admin',
  'a member cannot change who may add expenses'
);
select throws_ok(
  $$ select public.remove_member(pg_temp.flat(), '33333333-3333-3333-3333-333333333333') $$,
  '42501', 'not_admin',
  'a member cannot remove someone'
);
select throws_ok(
  $$ update public.apartment_members set role = 'admin' where user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null,
  'memberships cannot be changed directly'
);

-- The last admin --------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ select public.set_member_role(pg_temp.flat(), '11111111-1111-1111-1111-111111111111', 'member') $$,
  'P0001', 'last_admin',
  'the only admin cannot step down'
);
select throws_ok(
  $$ select public.leave_apartment(pg_temp.flat()) $$,
  'P0001', 'last_admin',
  'the only admin cannot leave while others remain'
);
select throws_ok(
  $$ select public.remove_member(pg_temp.flat(), '11111111-1111-1111-1111-111111111111') $$,
  'P0001', 'use_leave',
  'admins leave instead of removing themselves'
);

-- Admins at work ----------------------------------------------------------------------

select lives_ok(
  $$ select public.set_member_role(pg_temp.flat(), '22222222-2222-2222-2222-222222222222', 'admin') $$,
  'an admin can make a member an admin'
);
select is(pg_temp.role_of('22222222-2222-2222-2222-222222222222'), 'admin', 'the member is now an admin');

select lives_ok(
  $$ select public.set_member_role(pg_temp.flat(), '11111111-1111-1111-1111-111111111111', 'member') $$,
  'an admin can step down once another admin exists'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $$ select public.set_member_can_add_expense(pg_temp.flat(), '33333333-3333-3333-3333-333333333333', false) $$,
  'an admin can stop a member from adding expenses'
);
select is(
  (select can_add_expense from public.apartment_members
   where apartment_id = pg_temp.flat() and user_id = '33333333-3333-3333-3333-333333333333'),
  false,
  'the member can no longer add expenses'
);

select lives_ok(
  $$ select public.remove_member(pg_temp.flat(), '33333333-3333-3333-3333-333333333333') $$,
  'an admin can remove a member'
);

reset role;

select results_eq(
  $$ select left_reason from public.apartment_members where user_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values ('removed'::text) $$,
  'removal ends the membership and keeps the record'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ select public.remove_member(pg_temp.flat(), '33333333-3333-3333-3333-333333333333') $$,
  'P0002', 'member_not_found',
  'removing someone who is not a current member is refused'
);

-- Leaving -----------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ select public.leave_apartment(pg_temp.flat()) $$,
  'a member can leave'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $$ select public.leave_apartment(pg_temp.flat()) $$,
  'the last admin can leave once nobody else remains'
);

reset role;

select results_eq(
  $$ select action from public.audit_events where apartment_id = pg_temp.flat() order by id $$,
  $$ values ('created'::text), ('created'), ('joined'), ('joined'), ('role_changed'), ('role_changed'),
            ('expense_permission_changed'), ('removed'), ('left'), ('left') $$,
  'every change is recorded in the activity history, in order'
);

select is(
  (select count(*)::int from public.apartment_members where apartment_id = pg_temp.flat()),
  3,
  'no membership record was deleted'
);

select * from finish();

rollback;
