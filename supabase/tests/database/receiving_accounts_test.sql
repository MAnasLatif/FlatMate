-- Receiving accounts (SRS FR-01.3, FR-01.4, AC-12).
begin;

select plan(12);

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
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;
create function pg_temp.visible_to_me(owner uuid) returns text language sql as $$
  select coalesce(string_agg(provider, ',' order by provider), '') from public.get_shared_accounts(pg_temp.v('flat'), owner)
$$;

-- Anas and Zubair share Flat 4B; Ajmal lives in another flat with Anas.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('other', public.create_apartment('Flat 9', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
insert into vals values ('other_code', public.create_invite(pg_temp.v('other'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'other_code'));

select pg_temp.act_as(pg_temp.a());
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier, is_preferred)
values (pg_temp.a(), 'bank', 'Meezan Bank', 'Anas Latif', 'PK36MEZN0001234567890123', true);
insert into vals select 'meezan', id::text from public.receiving_accounts where provider = 'Meezan Bank';
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.a(), 'wallet', 'JazzCash', 'Anas Latif', '0300 1234567');
insert into vals select 'jazz', id::text from public.receiving_accounts where provider = 'JazzCash';

-- Private by default ------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select is(pg_temp.visible_to_me(pg_temp.a()), '', 'accounts are private by default (FR-01.4)');
select is_empty($$ select 1 from public.receiving_accounts $$, 'and nobody else can read the table (AC-12)');

select pg_temp.act_as(pg_temp.a());
select lives_ok($$ insert into public.receiving_account_shares (account_id, apartment_id) values (pg_temp.v('meezan'), pg_temp.v('flat')) $$,
  'the owner shares one account with Flat 4B');
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.visible_to_me(pg_temp.a()), 'Meezan Bank', 'Zubair sees only that account');
select is(
  (select account_identifier from public.get_shared_accounts(pg_temp.v('flat'), pg_temp.a())),
  'PK36MEZN0001234567890123',
  'with the full number, so he can pay'
);
select is_empty($$ select 1 from public.receiving_account_shares $$, 'but not the list of shares');

select pg_temp.act_as(pg_temp.j());
select is(
  (select count(*)::int from public.get_shared_accounts(pg_temp.v('flat'), pg_temp.a())),
  0,
  'Ajmal, from another flat, cannot see what Anas shares with Flat 4B'
);

-- Who may share and change ---------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ insert into public.receiving_account_shares (account_id, apartment_id) values (pg_temp.v('jazz'), pg_temp.v('flat')) $$,
  '42501', null, 'nobody can share someone else''s account');
select throws_ok($$ insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
    values (pg_temp.a(), 'bank', 'Fake', 'Anas', '12345678') $$,
  '42501', null, 'or add an account for them');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier, is_preferred)
    values (pg_temp.a(), 'bank', 'HBL', 'Anas', '12345678', true) $$,
  '23505', null, 'one account at most is preferred');
select throws_ok($$ insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
    values (pg_temp.a(), 'bank', 'HBL', 'Anas', 'x;drop') $$,
  '23514', null, 'an account number is letters, digits, spaces and dashes only');

select public.set_member_role(pg_temp.v('other'), pg_temp.j(), 'admin');
select public.leave_apartment(pg_temp.v('other'));
select throws_ok($$ insert into public.receiving_account_shares (account_id, apartment_id) values (pg_temp.v('jazz'), pg_temp.v('other')) $$,
  '42501', null, 'an account can only be shared with an apartment the owner is in');

select * from finish();

rollback;
