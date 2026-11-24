-- Security deposits (SRS FR-10.4).
begin;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('44444444-4444-4444-4444-444444444444', 'wali@example.test', '{"display_name": "Wali"}'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.join(code text) returns void language plpgsql as $$
declare
  joiner_claims text := current_setting('request.jwt.claims', true);
  result jsonb := public.join_apartment(code);
  admin uuid;
begin
  perform set_config('role', 'postgres', true);
  select user_id into admin from public.apartment_members
  where apartment_id = (result ->> 'apartment_id')::uuid and role = 'admin' and left_at is null
  order by joined_at limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.approve_join_request((result ->> 'request_id')::uuid);
  perform set_config('request.jwt.claims', joiner_claims, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.y() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.w() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.dep() returns uuid language sql as $$ select pg_temp.v('deposit')::uuid $$;
-- What p_debtor owes p_creditor in the ledger, net; negative when owed the other way.
create function pg_temp.owes(p_debtor uuid, p_creditor uuid) returns bigint language sql security definer as $$
  select coalesce(sum(
    (case when l.debtor_id = p_debtor then 1 else -1 end)
    * (case when l.kind in ('charge', 'adjustment') then 1 else -1 end) * l.amount_minor), 0)::bigint
  from public.ledger_entries l
  where l.apartment_id = pg_temp.flat()
    and ((l.debtor_id = p_debtor and l.creditor_id = p_creditor) or (l.debtor_id = p_creditor and l.creditor_id = p_debtor))
$$;
-- Each holder's share now, as "name:amount" in user id order.
create function pg_temp.shares() returns text language sql security definer as $$
  select coalesce(string_agg(p.display_name || ':' || s.amount_minor, ',' order by s.user_id), '')
  from private.deposit_shares_now(pg_temp.dep()) s join public.profiles p on p.id = s.user_id
$$;
create function pg_temp.people(variadic ids uuid[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('user_id', id)) from unnest(ids) id
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

-- Recording -------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.record_deposit(pg_temp.flat(), 'Deposit', 90000, current_date - 1,
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 90000)),
       'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.y())) $$,
  '42501', 'not_admin', 'only admins record a deposit');

select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.record_deposit(pg_temp.flat(), 'Deposit', 90000, current_date - 1,
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 80000)),
       'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.y())) $$,
  '22023', null, 'what was paid must add up to the deposit');
select throws_ok(
  $$ select public.record_deposit(pg_temp.flat(), 'Deposit', 90000, current_date + 400,
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 90000)),
       'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.y())) $$,
  '22023', 'invalid_paid_on', 'a deposit is not paid in the future');

-- Anas paid the landlord Rs 900; the three share it equally.
insert into vals values ('deposit', public.record_deposit(pg_temp.flat(), 'Flat deposit', 90000, current_date - 1,
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 90000)),
  'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.y()), 'Landlord', 'aaaaaaaa-0000-0000-0000-000000000001')::text);
select is(pg_temp.shares(), 'Anas:30000,Zubair:30000,Yasir:30000', 'each member holds their share');
select is(pg_temp.owes(pg_temp.z(), pg_temp.a()) || ':' || pg_temp.owes(pg_temp.y(), pg_temp.a()), '30000:30000',
  'whoever paid the landlord is owed the others'' shares');
select is(
  public.record_deposit(pg_temp.flat(), 'Flat deposit', 90000, current_date - 1,
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 90000)),
    'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.y()), 'Landlord', 'aaaaaaaa-0000-0000-0000-000000000001'),
  pg_temp.dep(), 'a retried request returns the same deposit');
select is((select count(*)::int from public.deposits), 1, 'and records nothing twice');
reset role;
select is(
  (select string_agg(n.user_id::text, ',' order by n.user_id) from public.notifications n where n.type = 'deposit.recorded'),
  pg_temp.z() || ',' || pg_temp.y(), 'the other holders are told, not the admin who recorded it');

-- Who sees it.
select pg_temp.act_as(pg_temp.z());
select is((select count(*)::int from public.deposit_entries where deposit_id = pg_temp.dep()), 3,
  'members see the deposit and every share');
select is((select count(*)::int from public.adjustments where deposit_action_id is not null), 1,
  'but only the adjustments they are part of');
select pg_temp.act_as(pg_temp.o());
select is((select count(*)::int from public.deposits), 0, 'someone outside the apartment sees no deposit');

-- Taking over ------------------------------------------------------------------------------

-- Wali moves in and takes over Yasir's share.
select pg_temp.act_as(pg_temp.w());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.take_over_deposit_share(pg_temp.dep(), pg_temp.y(), pg_temp.w(), 30001) $$,
  '22023', 'more_than_share', 'nobody takes over more than the share');
select throws_ok(
  $$ select public.take_over_deposit_share(pg_temp.dep(), pg_temp.y(), pg_temp.o(), 30000) $$,
  '22023', 'participant_not_member', 'only a current member takes a share over');
insert into vals values ('takeover', public.take_over_deposit_share(pg_temp.dep(), pg_temp.y(), pg_temp.w(), 30000,
  'aaaaaaaa-0000-0000-0000-000000000002')::text);
select is(
  public.take_over_deposit_share(pg_temp.dep(), pg_temp.y(), pg_temp.w(), 30000, 'aaaaaaaa-0000-0000-0000-000000000002')::text,
  pg_temp.v('takeover'), 'a retried takeover returns the first one');
select is(pg_temp.shares(), 'Anas:30000,Zubair:30000,Wali:30000', 'the share moves to whoever took it over');
select is(pg_temp.owes(pg_temp.w(), pg_temp.y()), 30000::bigint, 'who took it over owes its holder, once');

-- Yasir can leave and still sees the deposit he held a share of.
select pg_temp.act_as(pg_temp.y());
select public.leave_apartment(pg_temp.flat());
select is((select count(*)::int from public.deposits), 1, 'a former holder still sees the deposit');

-- Refunding a share ------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.refund_deposit_share(pg_temp.dep(), pg_temp.z(), 20000,
       '[{"amount_minor": 5000, "reason": "Broken lamp"}]') $$,
  '22023', 'refund_must_match_share', 'a refund and its deductions make up the whole share');
select throws_ok(
  $$ select public.refund_deposit_share(pg_temp.dep(), pg_temp.z(), 30000, '[{"amount_minor": 0, "reason": "x"}]') $$,
  '22023', 'invalid_deductions', 'each deduction is more than nothing');
select public.refund_deposit_share(pg_temp.dep(), pg_temp.z(), 25000, '[{"amount_minor": 5000, "reason": "Broken lamp"}]');
select is(pg_temp.shares(), 'Anas:30000,Wali:30000', 'a refunded share is gone');
select is(pg_temp.owes(pg_temp.z(), pg_temp.a()), 30000::bigint, 'and balances between members do not change');

-- Returning the deposit --------------------------------------------------------------------

-- The landlord returns the rest to Anas, keeping Rs 100.01 for cleaning.
select throws_ok(
  $$ select public.return_deposit(pg_temp.dep(), pg_temp.a(), 50000, '[{"amount_minor": 10001, "reason": "Cleaning"}]') $$,
  '22023', 'refund_must_match_share', 'the refund and deductions make up every share still held');
insert into vals values ('return', public.return_deposit(pg_temp.dep(), pg_temp.a(), 49999,
  '[{"amount_minor": 10001, "reason": "Cleaning"}]')::text);
select is(
  (select string_agg(kind || ':' || amount_minor, ',' order by user_id, kind)
   from public.deposit_entries where action_id = pg_temp.v('return')::uuid),
  'deduction:-5001,refund:-24999,deduction:-5000,refund:-25000',
  'deductions are shared by share, the odd unit by the usual rule, and each refund is the rest');
select is(pg_temp.shares(), '', 'nothing is held after the return');
select is(pg_temp.owes(pg_temp.a(), pg_temp.w()), 25000::bigint,
  'whoever received the refund owes each other holder their part');

-- Undoing ----------------------------------------------------------------------------------

select throws_ok(
  format($$ select public.undo_deposit_action('%s') $$, pg_temp.v('takeover')),
  '22023', 'not_latest_action', 'only the latest change can be undone');
select public.undo_deposit_action(pg_temp.v('return')::uuid);
select is(pg_temp.shares(), 'Anas:30000,Wali:30000', 'undoing the return gives the shares back');
select is(pg_temp.owes(pg_temp.a(), pg_temp.w()), 0::bigint, 'and reverses what it posted');

-- A share of someone who left must be dealt with before the deposit is returned.
select pg_temp.act_as(pg_temp.w());
select public.leave_apartment(pg_temp.flat());
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.return_deposit(pg_temp.dep(), pg_temp.a(), 60000) $$,
  '22023', 'former_member_holds_share', 'the deposit is not returned while someone who left holds a share');

select is(
  (select count(*)::int from public.get_activity(pg_temp.flat(), 'payments') where entity_type = 'deposit'), 5,
  'every deposit change is on the timeline');

select * from finish();

rollback;
