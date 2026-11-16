-- One join code per apartment (SRS FR-02.1, FR-02.2).
begin;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'sara@example.test', '{"display_name": "Sara"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.get_join_code(pg_temp.v('flat')::uuid));

select matches(pg_temp.v('code'), '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$',
  'an admin gets the apartment''s join code, made the first time');
select is(public.get_join_code(pg_temp.v('flat')::uuid), pg_temp.v('code'),
  'asking again gives the same code');
select is((select count(*)::int from public.apartment_invites), 1, 'so the apartment has one code');
select is((select expires_at from public.apartment_invites), 'infinity'::timestamptz,
  'and it does not expire');

-- Someone joins with it.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select is(public.join_apartment(pg_temp.v('code')) ->> 'status', 'requested',
  'the code sends a request to join');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok(format('select public.get_join_code(%L)', pg_temp.v('flat')),
  '42501', 'not_admin', 'someone who is not an admin cannot get the code');

-- Changing it.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('old_shared', public.create_invite(pg_temp.v('flat')::uuid));
insert into vals values ('new', public.change_join_code(pg_temp.v('flat')::uuid));
select isnt(pg_temp.v('new'), pg_temp.v('code'), 'an admin can change the code');
select is(public.get_join_code(pg_temp.v('flat')::uuid), pg_temp.v('new'), 'the new code is the apartment''s code');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select is(public.join_apartment(pg_temp.v('code')) ->> 'status', 'invalid_code',
  'the old code no longer works');
select is(public.join_apartment(pg_temp.v('old_shared')) ->> 'status', 'invalid_code',
  'nor does any older code that still worked');

select * from finish();
rollback;
