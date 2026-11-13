-- Apartments and memberships: creation, isolation between apartments, and
-- what members, former members and outsiders can see.
begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

-- Helpers to act as a user.
create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create temporary table ids (name text primary key, id uuid);
grant all on table ids to authenticated;

-- Signed-out requests -------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.create_apartment('Flat 4B', 1) $$,
  '42501',
  null,
  'signed-out requests cannot create an apartment'
);

reset role;

-- Creating apartments ------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into ids values ('flat', public.create_apartment('  Flat 4B  ', 5, 'Gulberg, Lahore', true));
insert into ids values ('home', public.create_apartment('Second home', 31));

select is(
  (select name from public.apartments where id = (select id from ids where name = 'flat')),
  'Flat 4B',
  'the apartment name is trimmed'
);

select results_eq(
  $$ select role, can_add_expense from public.apartment_members
     where apartment_id = (select id from ids where name = 'flat') $$,
  $$ values ('admin'::text, true) $$,
  'the creator becomes the only member, as admin'
);

select is(
  (select currency || '/' || timezone || '/' || approval_days from public.apartments
   where id = (select id from ids where name = 'flat')),
  'PKR/Asia/Karachi/7',
  'currency, timezone and objection window default to PKR, Asia/Karachi and 7 days'
);

select results_eq(
  $$ select action from public.audit_events where apartment_id = (select id from ids where name = 'flat') $$,
  $$ values ('created'::text) $$,
  'creating an apartment is recorded in the activity history'
);

select throws_ok(
  $$ select public.create_apartment('Flat', 1, p_timezone => 'Mars/Olympus') $$,
  '22023',
  'invalid_timezone',
  'an unknown timezone is rejected'
);

select throws_ok(
  $$ select public.create_apartment('Flat', 0) $$,
  '23514',
  null,
  'a settlement day outside 1 to 31 is rejected'
);

select throws_ok(
  $$ select public.create_apartment('   ', 1) $$,
  '23514',
  null,
  'a blank name is rejected'
);

insert into ids values ('euro', public.create_apartment('Euro flat', 1, p_currency => ' eur '));

select is(
  (select currency from public.apartments where id = (select id from ids where name = 'euro')),
  'EUR',
  'the currency code is normalised to upper case'
);

select throws_ok(
  $$ insert into public.apartments (name, settlement_day) values ('Direct', 1) $$,
  '42501',
  null,
  'apartments cannot be inserted directly'
);

select throws_ok(
  $$ update public.apartments set name = 'Renamed' where id = (select id from ids where name = 'flat') $$,
  '42501',
  null,
  'apartments cannot be updated directly'
);

select throws_ok(
  $$ insert into public.apartment_members (apartment_id, user_id)
     values ((select id from ids where name = 'flat'), '44444444-4444-4444-4444-444444444444') $$,
  '42501',
  null,
  'memberships cannot be inserted directly'
);

reset role;

-- Zubair joins the first apartment only (joining by code comes in the next migration).
insert into public.apartment_members (apartment_id, user_id)
values ((select id from ids where name = 'flat'), '22222222-2222-2222-2222-222222222222');

insert into storage.objects (bucket_id, name, owner_id)
values ('avatars', '11111111-1111-1111-1111-111111111111/avatar', '11111111-1111-1111-1111-111111111111');

-- A member of one apartment (AC-01) --------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select results_eq(
  $$ select name from public.apartments order by name $$,
  $$ values ('Flat 4B'::text) $$,
  'a member sees only the apartments they belong to'
);

select is(
  (select count(*)::int from public.apartment_members
   where apartment_id = (select id from ids where name = 'home')),
  0,
  'a member cannot see the members of an apartment they do not belong to'
);

select is(
  (select count(*)::int from public.apartment_members
   where apartment_id = (select id from ids where name = 'flat')),
  2,
  'a member sees everyone in their apartment'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Anas',
  'a member can read a flatmate''s profile'
);

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/avatar'),
  1,
  'a member can see a flatmate''s photo'
);

select is(
  (select count(*)::int from public.audit_events),
  1,
  'a member sees the activity history of their apartment only'
);

-- An outsider ----------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');

select is_empty($$ select 1 from public.apartments $$, 'an outsider sees no apartments');
select is_empty($$ select 1 from public.apartment_members $$, 'an outsider sees no memberships');
select is_empty($$ select 1 from public.audit_events $$, 'an outsider sees no activity');
select is_empty(
  $$ select 1 from public.profiles where id <> '44444444-4444-4444-4444-444444444444' $$,
  'an outsider cannot read other people''s profiles'
);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'avatars' $$,
  'an outsider cannot see other people''s photos'
);

-- A former member (SRS section 12, item 8) ---------------------------------------------

reset role;

update public.apartment_members
set left_at = now(), left_reason = 'left'
where user_id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select results_eq(
  $$ select name from public.apartments $$,
  $$ values ('Flat 4B'::text) $$,
  'a former member still sees the apartment their history belongs to'
);

select results_eq(
  $$ select user_id from public.apartment_members $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid) $$,
  'a former member sees only their own membership'
);

select is_empty(
  $$ select 1 from public.audit_events $$,
  'a former member no longer sees the activity history'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'private.require_admin(uuid)', 'execute'),
  'signed-in users cannot call internal checks directly'
);

select * from finish();

rollback;
