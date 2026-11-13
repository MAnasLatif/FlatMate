-- Objecting to payments and confirming them by app policy (SRS FR-07.5, FR-07.6, AC-07, AC-08).
begin;

select plan(19);

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

create function pg_temp.balance_with(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select final_minor || '/' || provisional_minor || '/' || disputed_minor
     from public.get_my_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;
create function pg_temp.payment_status(payment uuid) returns text language sql as $$
  select status from public.payments where id = payment
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));

-- Anas pays Rs 400 for internet split with Zubair: Zubair owes him Rs 200 and pays Rs 150.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(
  pg_temp.v('flat'), 'Internet', 40000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 40000)));
select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.v('flat'), pg_temp.a(), 15000)::text);

-- Declining inside the window -----------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.decline_payment(pg_temp.v('payment'), 'Not mine') $$,
  'P0002', 'payment_not_found', 'only the recipient can decline a payment');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.decline_payment(pg_temp.v('payment'), ' ') $$,
  '22023', 'reason_required', 'a decline needs a reason');
insert into vals values ('decline', public.decline_payment(pg_temp.v('payment'), 'Nothing arrived in my account')::text);
select is(pg_temp.payment_status(pg_temp.v('payment')), 'disputed', 'the payment is disputed');
select pg_temp.act_as(pg_temp.z());
select is(pg_temp.balance_with(pg_temp.a()), '0/20000/0',
  'and its provisional credit is reversed: Zubair owes the full Rs 200 again (AC-07)');
select pg_temp.act_as(pg_temp.a());
select is(
  public.decline_payment(pg_temp.v('payment'), 'Nothing arrived in my account'),
  pg_temp.v('decline'),
  'declining again returns the same case'
);
select is(
  (select count(*)::int from public.payments where id = pg_temp.v('payment') and reference is null and amount_minor = 15000),
  1,
  'the payment record itself is kept as it was'
);

-- Withdrawing -------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.withdraw_payment_decline(pg_temp.v('decline')) $$,
  '42501', 'not_dispute_raiser', 'only the recipient can withdraw the decline');
select pg_temp.act_as(pg_temp.a());
select lives_ok($$ select public.withdraw_payment_decline(pg_temp.v('decline')) $$, 'Anas finds the money and withdraws');
select ok(
  pg_temp.payment_status(pg_temp.v('payment')) = 'provisional'
  and (select finalize_after > now() + interval '6 days' from public.payments where id = pg_temp.v('payment')),
  'the payment counts again and its window resumes'
);

-- Voiding -----------------------------------------------------------------------------------

-- Anas declines it again, and this time it really went to the wrong account.
select public.decline_payment(pg_temp.v('payment'), 'Wrong account');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.void_payment(pg_temp.v('payment')) $$,
  'P0002', 'payment_not_found', 'only the payer can void a payment');
select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.void_payment(pg_temp.v('payment'), 'I will pay again') $$, 'Zubair voids it');
select is(
  pg_temp.payment_status(pg_temp.v('payment'))
    || '/' || (select string_agg(resolution, ',' order by resolution) from public.payment_disputes
               where payment_id = pg_temp.v('payment')),
  'void/voided,withdrawn',
  'the payment is void and the open case is resolved as voided'
);
select is(pg_temp.balance_with(pg_temp.a()), '0/20000/0', 'a void payment does not count');
select lives_ok($$ select public.void_payment(pg_temp.v('payment')) $$, 'voiding again changes nothing');

-- Confirmation by app policy ---------------------------------------------------------------

insert into vals values ('second', public.record_payment(pg_temp.v('flat'), pg_temp.a(), 20000)::text);
reset role;
update public.payments set finalize_after = now() - interval '2 days' where id = pg_temp.v('second');
select is(private.finalize_due_payments(), 1, 'with no objection, the job confirms the payment (AC-08)');
select is(pg_temp.payment_status(pg_temp.v('second')), 'final', 'as final, confirmed by app policy');
select is(private.finalize_due_payments(), 0, 'running it again confirms nothing');

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.void_payment(pg_temp.v('second')) $$,
  'P0001', 'payment_final', 'a final payment cannot be voided');
select pg_temp.act_as(pg_temp.a());
select public.decline_payment(pg_temp.v('second'), 'Found it was from someone else');
select ok(
  (select is_late from public.payment_disputes where payment_id = pg_temp.v('second'))
  and pg_temp.payment_status(pg_temp.v('second')) = 'final',
  'a decline after the deadline is a late case that leaves the payment final'
);

select * from finish();

rollback;
