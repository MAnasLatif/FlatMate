-- Join codes: creation by admins, joining, expiry, revocation and rate limiting.
begin;

select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'guesser@example.test', '{"display_name": "Guesser"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;

-- Anas creates the apartment and a code ---------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite((select val::uuid from vals where name = 'flat')));

select matches(
  (select val from vals where name = 'code'),
  '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$',
  'a code is 8 Crockford Base32 characters shown as XXXX-XXXX'
);

reset role;

select is(
  (select code_hash from public.apartment_invites),
  encode(extensions.digest(replace((select val from vals where name = 'code'), '-', ''), 'sha256'), 'hex'),
  'only the SHA-256 hash of the code is stored'
);

select is(
  private.normalize_invite_code(' abcd-oil1 '),
  'ABCD0111',
  'typed codes ignore case and separators, and read O, I, L as 0, 1, 1'
);

-- Joining ---------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is(
  public.join_apartment(lower(replace((select val from vals where name = 'code'), '-', ' '))) ->> 'status',
  'joined',
  'a signed-in user joins with the code typed in lower case with a space'
);

reset role;

select results_eq(
  $$ select role, can_add_expense from public.apartment_members
     where user_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('member'::text, true) $$,
  'someone who joins becomes a member who can add expenses'
);

select is(
  (select count(*)::int from public.audit_events where action = 'joined'),
  1,
  'joining is recorded in the activity history'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is(
  public.join_apartment((select val from vals where name = 'code')) ->> 'status',
  'already_member',
  'joining twice reports that the user is already a member'
);

select is(
  public.join_apartment('ZZZZ-ZZZZ') ->> 'status',
  'invalid_code',
  'a wrong code is reported as invalid without saying why'
);

-- Only admins manage codes ----------------------------------------------------------

select throws_ok(
  format('select public.create_invite(%L)', (select val from vals where name = 'flat')),
  '42501',
  'not_admin',
  'a member who is not an admin cannot create a code'
);

select is_empty(
  $$ select 1 from public.apartment_invites $$,
  'a member who is not an admin cannot see the codes'
);

select throws_ok(
  format('select public.revoke_invite(%L)', (select id from public.apartment_invites limit 1)),
  'P0002',
  null,
  'a member cannot revoke a code they cannot see'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select is(
  (select count(*)::int from public.apartment_invites),
  1,
  'an admin sees the codes of their apartment'
);

select throws_ok(
  $$ select code_hash from public.apartment_invites $$,
  '42501',
  null,
  'nobody can read the stored hashes'
);

select throws_ok(
  format('select public.create_invite(%L, 0)', (select val from vals where name = 'flat')),
  '22023',
  'invalid_validity',
  'a code must be valid for 1 to 30 days'
);

-- Expiry and revocation -------------------------------------------------------------

insert into vals values ('expired', public.create_invite((select val::uuid from vals where name = 'flat')));
insert into vals values ('revoked', public.create_invite((select val::uuid from vals where name = 'flat')));

reset role;

insert into vals
select 'revoked_id', id::text from public.apartment_invites
where code_hash = private.hash_invite_code((select val from vals where name = 'revoked'));

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  format('select public.revoke_invite(%L)', (select val from vals where name = 'revoked_id')),
  'an admin can revoke a code'
);

reset role;

update public.apartment_invites
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where code_hash = private.hash_invite_code((select val from vals where name = 'expired'));

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select is(
  public.join_apartment((select val from vals where name = 'expired')) ->> 'status',
  'invalid_code',
  'an expired code no longer works'
);

select is(
  public.join_apartment((select val from vals where name = 'revoked')) ->> 'status',
  'invalid_code',
  'a revoked code no longer works'
);

select is(
  public.join_apartment((select val from vals where name = 'code')) ->> 'status',
  'joined',
  'other valid codes keep working'
);

-- Rate limiting -----------------------------------------------------------------------

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');

select is(
  (select array_agg(public.join_apartment('WRONG-' || n) ->> 'status') from generate_series(1, 5) n),
  array['invalid_code', 'invalid_code', 'invalid_code', 'invalid_code', 'invalid_code'],
  'five wrong guesses are each reported as invalid'
);

select is(
  public.join_apartment((select val from vals where name = 'code')) ->> 'status',
  'rate_limited',
  'after five wrong guesses in 15 minutes even a valid code is refused'
);

reset role;

select is(
  (select count(*)::int from public.apartment_members where user_id = '44444444-4444-4444-4444-444444444444'),
  0,
  'the rate-limited user did not join'
);

set local role anon;

select throws_ok(
  $$ select public.join_apartment('ABCD-EFGH') $$,
  '42501',
  null,
  'signed-out requests cannot join'
);

reset role;

select * from finish();

rollback;
