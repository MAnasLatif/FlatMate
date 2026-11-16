-- Profiles: creation at sign-up, row-level security and privileges.
begin;

select plan(20);

-- Users are created the way Supabase Auth creates them: a row in auth.users.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "  Anas  "}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "   ", "full_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{}'),
  ('44444444-4444-4444-4444-444444444444', 'long@example.test',
    jsonb_build_object('display_name', repeat('a', 79) || ' ' || repeat('b', 40))),
  ('55555555-5555-5555-5555-555555555555', 'none@example.test', null);

-- Creation at sign-up ------------------------------------------------------

select results_eq(
  $$ select count(*)::int from public.profiles $$,
  array[5],
  'a profile is created for every new user'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Anas',
  'the display name from sign-up is trimmed'
);

select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Zubair',
  'a blank display name falls back to full_name'
);

select is(
  (select display_name from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  null,
  'without a name in the metadata the display name stays empty'
);

select ok(
  (select char_length(display_name) <= 80 and display_name = btrim(display_name)
   from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'an over-long name is shortened without leaving trailing spaces'
);

select is(
  (select display_name from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  null,
  'a user created without any metadata still gets a profile'
);

-- Privileges -----------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute')
  and not has_function_privilege('anon', 'private.handle_new_user()', 'execute'),
  'client roles cannot execute the sign-up function'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'signed-out requests have no access to the private schema'
);

-- Signed-out requests ----------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'signed-out requests cannot read profiles'
);

reset role;

-- A signed-in user ------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'a user sees only their own profile'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Anas Latif' where id = '11111111-1111-1111-1111-111111111111' $$,
  'a user can rename themselves'
);

select results_eq(
  $$ update public.profiles set display_name = 'Taken over'
     where id = '22222222-2222-2222-2222-222222222222' returning id $$,
  $$ select null::uuid where false $$,
  'a user cannot rename someone else'
);

select throws_ok(
  $$ update public.profiles set display_name = '' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'an empty display name is rejected'
);

select throws_ok(
  $$ update public.profiles set display_name = ' padded ' where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a display name with surrounding spaces is rejected'
);

select throws_ok(
  $$ update public.profiles set id = '22222222-2222-2222-2222-222222222222'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a user cannot change their profile id'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Intruder') $$,
  '42501',
  null,
  'a user cannot create profiles'
);

select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'a user cannot delete a profile'
);

reset role;

select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Zubair',
  'the other user''s profile is unchanged'
);

-- updated_at ------------------------------------------------------------------

update public.profiles
set updated_at = '2000-01-01T00:00:00Z'
where id = '33333333-3333-3333-3333-333333333333';

update public.profiles
set display_name = 'Ajmal'
where id = '33333333-3333-3333-3333-333333333333';

select ok(
  (select updated_at > '2000-01-01T00:00:00Z' from public.profiles
   where id = '33333333-3333-3333-3333-333333333333'),
  'updated_at moves forward when a profile changes'
);

-- Account deletion ------------------------------------------------------------

delete from auth.users where id = '55555555-5555-5555-5555-555555555555';

select is_empty(
  $$ select 1 from public.profiles where id = '55555555-5555-5555-5555-555555555555' $$,
  'deleting a user deletes their profile'
);

select * from finish();

rollback;
