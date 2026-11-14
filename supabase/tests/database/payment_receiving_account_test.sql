-- Recording which of the recipient's accounts a payment went to, with a snapshot
-- that outlives edits and deletion of the account.
begin;

select plan(14);

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

-- Anas has a shared bank account, a private wallet, and Ajmal has his own account.
select pg_temp.act_as(pg_temp.a());
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.a(), 'bank', 'Meezan Bank', 'Anas Latif', 'PK36 MEZN-0001 2345 6789 0123')
returning id::text as val \gset shared_
insert into vals values ('shared', :'shared_val');
insert into public.receiving_account_shares (account_id, apartment_id) values (pg_temp.v('shared'), pg_temp.v('flat'));
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.a(), 'wallet', 'JazzCash', 'Anas Latif', '03001234567')
returning id::text as val \gset private_
insert into vals values ('private', :'private_val');
select pg_temp.act_as(pg_temp.j());
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.j(), 'bank', 'HBL', 'Ajmal', '1234567890')
returning id::text as val \gset other_
insert into vals values ('other', :'other_val');
insert into public.receiving_account_shares (account_id, apartment_id) values (pg_temp.v('other'), pg_temp.v('flat'));

-- Anas pays Rs 400 for internet split with Zubair: Zubair owes him Rs 200.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(
  pg_temp.v('flat'), 'Internet', 40000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 40000)));

-- Choosing the account -------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 5000, p_receiving_account_id => pg_temp.v('private')) $$,
  '22023', 'account_not_shared', 'an account the recipient did not share with the apartment is refused');
select throws_ok(
  $$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 5000, p_receiving_account_id => pg_temp.v('other')) $$,
  '22023', 'account_not_shared', 'someone else''s account is refused, even when shared');
select throws_ok(
  $$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 5000, p_receiving_account_id => gen_random_uuid()) $$,
  '22023', 'account_not_shared', 'an unknown account is refused the same way');

insert into vals values ('paid', public.record_payment(
  pg_temp.v('flat'), pg_temp.a(), 5000, p_receiving_account_id => pg_temp.v('shared'))::text);
select is(
  (select row(receiving_account_id, paid_to_provider, paid_to_title, paid_to_identifier_masked)::text
   from public.payments where id = pg_temp.v('paid')),
  row(pg_temp.v('shared'), 'Meezan Bank', 'Anas Latif', '•••• 0123')::text,
  'the payment links the account and keeps its provider, title and masked number');
select is(
  (select paid_to_identifier_masked from public.payments where id = pg_temp.v('paid')),
  '•••• 0123', 'spaces and dashes are left out of the masked number, as in the app');

insert into vals values ('cash', public.record_payment(pg_temp.v('flat'), pg_temp.a(), 2000)::text);
select is(
  (select num_nulls(receiving_account_id, paid_to_provider, paid_to_title, paid_to_identifier_masked)
   from public.payments where id = pg_temp.v('cash')),
  4, 'a payment without an account has no link and no snapshot');

select throws_ok(
  $$ select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 999999, p_receiving_account_id => pg_temp.v('shared')) $$,
  '22023', 'payment_exceeds_debt', 'choosing an account does not skip the other checks');

-- A retry with the same request id returns the first payment, account and all.
insert into vals values ('request', gen_random_uuid()::text);
insert into vals values ('first', public.record_payment(
  pg_temp.v('flat'), pg_temp.a(), 1000, p_client_request_id => pg_temp.v('request'),
  p_receiving_account_id => pg_temp.v('shared'))::text);
select is(
  public.record_payment(pg_temp.v('flat'), pg_temp.a(), 1000, p_client_request_id => pg_temp.v('request')),
  pg_temp.v('first'), 'a retried payment is not recorded twice');

-- The recipient finds the payments made to the account ----------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(
  (select count(*)::int from public.payments where receiving_account_id = pg_temp.v('shared')),
  2, 'the recipient sees the payments made to the account');
select pg_temp.act_as(pg_temp.j());
select is(
  (select count(*)::int from public.payments where receiving_account_id = pg_temp.v('shared')),
  0, 'a flatmate who is not part of the payments does not see them');

-- History outlives the account -----------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
update public.receiving_accounts set provider = 'Meezan', account_title = 'M Anas Latif'
where id = pg_temp.v('shared');
select is(
  (select paid_to_provider || ' / ' || paid_to_title from public.payments where id = pg_temp.v('paid')),
  'Meezan Bank / Anas Latif', 'editing the account does not change an old payment');

delete from public.receiving_accounts where id = pg_temp.v('shared');
select is(
  (select receiving_account_id from public.payments where id = pg_temp.v('paid')),
  null::uuid, 'deleting the account clears the link');
select is(
  (select paid_to_provider || ' / ' || paid_to_identifier_masked from public.payments where id = pg_temp.v('paid')),
  'Meezan Bank / •••• 0123', 'and the payment still shows the account it went to');
select is(
  (select amount_minor from public.payments where id = pg_temp.v('paid')),
  5000::bigint, 'the payment itself is untouched');

select * from finish();
rollback;
