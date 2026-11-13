-- Member exit (SRS FR-02.4, AC-11).
begin;

select plan(9);

-- The ids sort Anas, Zubair, Ajmal.
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

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Anas pays Rs 300 for groceries for all three; Zubair shares his account with the flat.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat'), 'Groceries', 30000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
                    jsonb_build_object('user_id', pg_temp.j())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 30000)));
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.a(), 'bank', 'Meezan Bank', 'Anas', 'PK36MEZN0001234567890123');
insert into public.receiving_account_shares (account_id, apartment_id)
select id, pg_temp.v('flat') from public.receiving_accounts where user_id = pg_temp.a();
select pg_temp.act_as(pg_temp.z());
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.z(), 'wallet', 'JazzCash', 'Zubair', '0300 1234567');
insert into public.receiving_account_shares (account_id, apartment_id)
select id, pg_temp.v('flat') from public.receiving_accounts where user_id = pg_temp.z();

-- Zubair leaves owing Rs 100 -------------------------------------------------------------------

select public.leave_apartment(pg_temp.v('flat'));
select is(
  (select x.reason || ':' || b.provisional_minor
   from public.member_exits x join public.member_exit_balances b on b.exit_id = x.id
   where x.user_id = pg_temp.z() and b.counterparty_id = pg_temp.a()),
  'left:10000',
  'leaving records what Zubair owed Anas when he left'
);
select is(
  (select final_minor + provisional_minor from public.get_my_balances(pg_temp.v('flat')) where counterparty_id = pg_temp.a())::bigint,
  10000::bigint,
  'and changes nothing: he still owes Rs 100 (FR-02.4)'
);
select is(
  (select provider from public.get_shared_accounts(pg_temp.v('flat'), pg_temp.a())),
  'Meezan Bank',
  'as a former member he still sees the account of Anas, whom he owes, so he can pay'
);
select lives_ok($$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 10000) $$, 'and he pays what he owes');
select is(
  (select count(*)::int from public.get_shared_accounts(pg_temp.v('flat'), pg_temp.a())),
  0,
  'once he owes nothing he no longer sees it'
);
select is_empty(
  $$ select 1 from public.apartment_members where user_id <> pg_temp.z() and apartment_id = pg_temp.v('flat') $$,
  'and he cannot see the current members (AC-11)'
);

-- Removal -----------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select public.remove_member(pg_temp.v('flat'), pg_temp.j());
select is(
  (select x.reason || ':' || x.exited_by::text || ':' || b.provisional_minor
   from public.member_exits x join public.member_exit_balances b on b.exit_id = x.id
   where x.user_id = pg_temp.j()),
  'removed:' || pg_temp.a()::text || ':10000',
  'a removal is recorded with who removed them and what they owed'
);
select pg_temp.act_as(pg_temp.j());
select is(
  (select count(*)::int from public.member_exit_balances),
  1,
  'Ajmal sees his own exit balance'
);
select is_empty(
  $$ select 1 from public.member_exit_balances b join public.member_exits x on x.id = b.exit_id where x.user_id = pg_temp.z() $$,
  'but not Zubair''s'
);

select * from finish();

rollback;
