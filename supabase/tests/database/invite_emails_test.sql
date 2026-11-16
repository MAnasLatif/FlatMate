-- Invites sent by email: only admins, checked addresses, rate limits, and no
-- stored address.
begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}');

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
insert into vals values (
  'first',
  public.prepare_invite_email((select val::uuid from vals where name = 'flat'), ' New.Person@Example.TEST ')::text
);

select matches(
  (select val::jsonb ->> 'code' from vals where name = 'first'),
  '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$',
  'an admin gets a join code to email'
);

select is(
  (select val::jsonb - 'code' from vals where name = 'first'),
  '{"apartment_name": "Flat 4B", "inviter_name": "Anas"}'::jsonb,
  'with what the email says: the apartment and the inviter'
);

select is(
  (select val::jsonb ->> 'code' from vals where name = 'first'),
  public.get_join_code((select val::uuid from vals where name = 'flat')),
  'the email carries the apartment''s one join code, not a new one'
);

reset role;

select is(
  (select recipient_hash from private.invite_emails),
  encode(extensions.digest('new.person@example.test', 'sha256'), 'hex'),
  'only a hash of the address, trimmed and in lower case, is stored'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'not-an-address') $$,
  'invalid_email',
  'an address without a domain is refused'
);

-- Two more to the same address reach the limit of three a day.
select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'new.person@example.test');
select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'NEW.PERSON@example.test');

select throws_ok(
  $$ select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'new.person@example.test') $$,
  'rate_limited',
  'a fourth email to the same address in a day is refused'
);

select lives_ok(
  $$ select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'someone.else@example.test') $$,
  'other addresses can still be invited'
);

-- Four sent so far; sixteen more reach the admin's limit of twenty a day.
select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'person' || n || '@example.test')
from generate_series(1, 16) as n;

select throws_ok(
  $$ select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'one.more@example.test') $$,
  'rate_limited',
  'an admin can send at most twenty invite emails a day'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ select public.prepare_invite_email((select val::uuid from vals where name = 'flat'), 'friend@example.test') $$,
  'not_admin',
  'someone who is not an admin of the apartment cannot send invites'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.prepare_invite_email(uuid, text)', 'execute'),
  'signed-out callers cannot ask for invite emails'
);

select ok(
  not has_table_privilege('authenticated', 'private.invite_emails', 'select'),
  'nobody signed in can read the record of invite emails'
);

select * from finish();
rollback;
