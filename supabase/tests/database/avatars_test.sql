-- Profile photos: the avatars bucket and the profile's avatar_path.
begin;

select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test');

select ok(
  (select not public from storage.buckets where id = 'avatars'),
  'the avatars bucket is private'
);

-- As Anas ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', '11111111-1111-1111-1111-111111111111/avatar', '11111111-1111-1111-1111-111111111111') $$,
  'a user can upload into their own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', '22222222-2222-2222-2222-222222222222/avatar', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a user cannot upload into someone else''s folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatars', 'avatar', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'a user cannot upload outside a user folder'
);

select lives_ok(
  $$ update public.profiles set avatar_path = '11111111-1111-1111-1111-111111111111/avatar'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'a user can point their profile at their own photo'
);

select throws_ok(
  $$ update public.profiles set avatar_path = '22222222-2222-2222-2222-222222222222/avatar'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514',
  null,
  'a user cannot point their profile at someone else''s photo'
);

reset role;

insert into storage.objects (bucket_id, name, owner_id)
values ('avatars', '22222222-2222-2222-2222-222222222222/avatar', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  $$ select name from storage.objects where bucket_id = 'avatars' order by name $$,
  $$ values ('11111111-1111-1111-1111-111111111111/avatar'::text) $$,
  'a user sees only their own photo'
);

select results_eq(
  $$ update storage.objects set name = name where bucket_id = 'avatars'
     and name = '22222222-2222-2222-2222-222222222222/avatar' returning name $$,
  $$ select null::text where false $$,
  'a user cannot replace someone else''s photo'
);

reset role;

-- Storage forbids deleting rows in SQL (deletes go through the Storage API), so
-- check that deleting is limited by the same condition as reading, which is
-- tested above.
select is(
  (select qual from pg_policies where schemaname = 'storage' and policyname = 'Users can delete their own avatar'),
  (select qual from pg_policies where schemaname = 'storage' and policyname = 'Users can read their own avatar'),
  'a user can delete only within their own folder'
);

reset role;

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'avatars' and name = '22222222-2222-2222-2222-222222222222/avatar'),
  1,
  'the other user''s photo is still there'
);

-- Signed out -------------------------------------------------------------------

set local role anon;

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'avatars' $$,
  'signed-out requests see no photos'
);

reset role;

select * from finish();

rollback;
