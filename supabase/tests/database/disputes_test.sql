-- Disputes about expenses (SRS FR-05.2 to FR-05.7, AC-06, section 12 items 2 and 4).
begin;

select plan(45);

-- The ids sort Anas, Zubair, Ajmal, Kamran, which decides who gets leftover units.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('55555555-5555-5555-5555-555555555555', 'kamran@example.test', '{"display_name": "Kamran"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.k() returns uuid language sql as $$ select '55555555-5555-5555-5555-555555555555'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.people(variadic ids uuid[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('user_id', id)) from unnest(ids) id
$$;
create function pg_temp.paid_by(payer uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount))
$$;
create function pg_temp.open_charges(expense uuid) returns text language sql as $$
  select coalesce(string_agg(left(c.debtor_id::text, 1) || '>' || left(c.creditor_id::text, 1) || ':' || c.amount_minor, ' '
    order by c.debtor_id, c.creditor_id), '')
  from public.ledger_entries c
  where c.expense_id = expense and c.kind = 'charge'
    and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = c.id)
$$;
create function pg_temp.split(expense uuid) returns text language sql as $$
  select string_agg(left(s.user_id::text, 1) || ':' || s.amount_minor, ' ' order by s.user_id)
  from public.expense_splits s join public.expenses e on e.id = s.expense_id and e.revision = s.revision
  where s.expense_id = expense
$$;
create function pg_temp.status(expense uuid) returns text language sql as $$
  select status from public.expenses where id = expense
$$;
create function pg_temp.balance_with(counterparty uuid) returns text language sql as $$
  select coalesce(
    (select final_minor || '/' || provisional_minor || '/' || disputed_minor
     from public.get_my_balances(pg_temp.v('flat')) where counterparty_id = counterparty),
    'none')
$$;

-- Anas (admin) with Zubair, Ajmal and Kamran.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.k());
select public.join_apartment((select val from vals where name = 'code'));

-- Zubair pays Rs 300 of groceries for Anas, Zubair and Ajmal: Rs 100 each.
select pg_temp.act_as(pg_temp.z());
insert into vals values ('groceries', public.post_expense(
  pg_temp.v('flat'), 'Groceries', 30000, current_date, 'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j()),
  pg_temp.paid_by(pg_temp.z(), 30000))::text);
-- Anas pays Rs 9 of cleaning for the same three.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(
  pg_temp.v('flat'), 'Cleaning', 900, current_date, 'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j()),
  pg_temp.paid_by(pg_temp.a(), 900))::text);

-- Raising inside the window -------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('first', public.raise_dispute(
  pg_temp.v('groceries'), 'adjustment', 'I was away for half of it', 5000,
  '99999999-9999-9999-9999-999999999999')::text);
select is(pg_temp.status(pg_temp.v('groceries')), 'disputed', 'a dispute inside the window holds the expense (AC-06)');
select is(pg_temp.balance_with(pg_temp.z()), '0/-300/10000',
  'every share of it is held, while the cleaning Zubair owes Anas stays payable (section 12 item 2)');
select is(
  public.raise_dispute(pg_temp.v('groceries'), 'adjustment', 'I was away for half of it', 5000,
    '99999999-9999-9999-9999-999999999999'),
  pg_temp.v('first'),
  'retrying the same request returns the same dispute'
);
select ok(
  (select window_remaining > interval '6 days' and not is_late from public.disputes where id = pg_temp.v('first')),
  'it remembers how much of the window was left'
);
select is(
  (select actor_id || ':' || action || ':' || (details ->> 'proposed_share_minor') from public.dispute_events where dispute_id = pg_temp.v('first')),
  pg_temp.a() || ':raised:5000',
  'raising is recorded with the proposal'
);

select pg_temp.act_as(pg_temp.j());
select throws_ok($$ select public.raise_dispute(pg_temp.v('groceries'), 'decline', 'Not mine') $$,
  'P0001', 'dispute_already_open', 'one dispute at a time per expense');
select pg_temp.act_as(pg_temp.z());
insert into vals values ('parallel', public.raise_dispute(pg_temp.v('cleaning'), 'decline', 'Not mine')::text);
select is(pg_temp.status(pg_temp.v('cleaning')), 'disputed', 'a different expense can be disputed at the same time');
select lives_ok($$ select public.withdraw_dispute(pg_temp.v('parallel')) $$, 'and withdrawn');
select pg_temp.act_as(pg_temp.k());
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'decline', 'Not mine') $$,
  '42501', 'not_in_expense', 'only people in the split can dispute it');
select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'decline', 'Not mine') $$,
  'P0002', 'expense_not_found', 'someone outside the apartment cannot see it');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'decline', 'Mine') $$,
  'P0001', 'cannot_dispute_own_expense', 'the person who added an expense edits it instead');

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.edit_expense(pg_temp.v('groceries'), 1, 'Groceries', null, null, current_date, null,
    40000, 'equal', pg_temp.people(pg_temp.a(), pg_temp.z(), pg_temp.j()), pg_temp.paid_by(pg_temp.z(), 40000)) $$,
  'P0001', 'expense_disputed', 'a disputed expense cannot be edited meanwhile');

-- Accepting ---------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.respond_to_dispute(pg_temp.v('first'), true) $$,
  '42501', 'not_expense_creator', 'only the person who added the expense answers');
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.respond_to_dispute(pg_temp.v('first'), false) $$,
  '22023', 'message_required', 'a rejection says why');
select lives_ok($$ select public.respond_to_dispute(pg_temp.v('first'), true, 'Fair enough') $$, 'Zubair accepts');
select is(pg_temp.split(pg_temp.v('groceries')), '1:5000 2:12500 3:12500',
  'Anas pays Rs 50 and the other Rs 250 is shared by the others in proportion to their shares');
select is(pg_temp.open_charges(pg_temp.v('groceries')), '1>2:5000 3>2:12500', 'only the adjusted charges are in force');
select ok(
  (select status = 'provisional' and revision = 2 and finalize_after > now() + interval '6 days'
   from public.expenses where id = pg_temp.v('groceries')),
  'the adjusted expense is provisional again, so the others can object to their new shares'
);
select is(
  (select state || '/' || resolution from public.disputes where id = pg_temp.v('first')),
  'resolved/adjusted',
  'the dispute is resolved as adjusted'
);
select lives_ok($$ select public.respond_to_dispute(pg_temp.v('first'), true, 'Fair enough') $$,
  'accepting again changes nothing');
select is(
  (select string_agg(action, ',' order by id) from public.dispute_events where dispute_id = pg_temp.v('first')),
  'raised,accepted',
  'and is recorded once'
);

-- Rejecting and an admin's decision -------------------------------------------------------------

select pg_temp.act_as(pg_temp.j());
insert into vals values ('second', public.raise_dispute(pg_temp.v('groceries'), 'decline', 'I did not eat any of it')::text);
select is(
  (select kind || '/' || proposed_share_minor from public.disputes where id = pg_temp.v('second')),
  'decline/0',
  'a decline proposes a zero share'
);
select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select public.respond_to_dispute(pg_temp.v('second'), false, 'You had the biryani') $$,
  'Zubair rejects it');
select is(
  (select state from public.disputes where id = pg_temp.v('second')) || '/' || pg_temp.status(pg_temp.v('groceries')),
  'escalated/disputed',
  'the dispute waits for an admin and the expense stays held'
);
select throws_ok($$ select public.decide_dispute(pg_temp.v('second'), false, 'Mine') $$,
  '42501', 'not_allowed_to_decide', 'the person who added the expense cannot decide');
select pg_temp.act_as(pg_temp.k());
select throws_ok($$ select public.decide_dispute(pg_temp.v('second'), false, 'Hmm') $$,
  '42501', 'not_allowed_to_decide', 'a member who is not an admin cannot decide');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.decide_dispute(pg_temp.v('second'), false, null) $$,
  '22023', 'message_required', 'a decision says why');
select lives_ok($$ select public.decide_dispute(pg_temp.v('second'), false, 'Receipts show three plates') $$,
  'Anas, an admin with no part in it, upholds the expense');
select ok(
  (select status = 'provisional' and finalize_after > now() + interval '6 days'
   from public.expenses where id = pg_temp.v('groceries')),
  'the expense is no longer held and its window resumes where it paused'
);
select is(pg_temp.split(pg_temp.v('groceries')), '1:5000 2:12500 3:12500', 'and its split is unchanged');

-- Late objections -------------------------------------------------------------------------

reset role;
update public.expenses set status = 'final', finalized_at = now() where id = pg_temp.v('groceries');
select pg_temp.act_as(pg_temp.j());
insert into vals values ('late', public.raise_dispute(pg_temp.v('groceries'), 'adjustment', 'Should be Rs 100', 10000)::text);
select ok(
  (select is_late from public.disputes where id = pg_temp.v('late')) and pg_temp.status(pg_temp.v('groceries')) = 'final',
  'after the deadline an objection opens an adjustment case and holds nothing (section 12 item 4)'
);
select is(pg_temp.balance_with(pg_temp.z()), '12500/0/0', 'what Ajmal owes stays final');
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.void_expense(pg_temp.v('groceries')) $$,
  'P0001', 'expense_disputed', 'the expense cannot be voided while the case is open');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select public.withdraw_dispute(pg_temp.v('late')) $$,
  '42501', 'not_dispute_raiser', 'only the person who raised it can withdraw it');
select pg_temp.act_as(pg_temp.j());
select lives_ok($$ select public.withdraw_dispute(pg_temp.v('late')) $$, 'Ajmal withdraws it');
select is(
  (select resolution from public.disputes where id = pg_temp.v('late')) || '/' || pg_temp.status(pg_temp.v('groceries')),
  'withdrawn/final',
  'and the expense is final as before'
);

-- Proposals that cannot work --------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'decline', '  ') $$,
  '22023', 'reason_required', 'a reason is required');
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'adjustment', 'More', 901) $$,
  '22023', 'invalid_proposed_share', 'a share cannot be more than the expense');
select throws_ok($$ select public.raise_dispute(pg_temp.v('cleaning'), 'adjustment', 'Same', 300) $$,
  '22023', 'proposal_matches_share', 'a proposal must change something');

select pg_temp.act_as(pg_temp.k());
insert into vals values ('gift', public.post_expense(
  pg_temp.v('flat'), 'Gift', 1000, current_date, 'fixed',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 1000),
                    jsonb_build_object('user_id', pg_temp.k(), 'amount_minor', 0)),
  pg_temp.paid_by(pg_temp.k(), 1000))::text);
select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select public.raise_dispute(pg_temp.v('gift'), 'adjustment', 'Half', 500) $$,
  '22023', 'adjustment_not_possible', 'there must be someone else in the split to take on the difference');

-- A creator who has left --------------------------------------------------------------------

select pg_temp.act_as(pg_temp.k());
insert into vals values ('lamp', public.post_expense(
  pg_temp.v('flat'), 'Lamp', 600, current_date, 'equal', pg_temp.people(pg_temp.z(), pg_temp.k()),
  pg_temp.paid_by(pg_temp.k(), 600))::text);
select pg_temp.act_as(pg_temp.z());
insert into vals values ('lamp_dispute', public.raise_dispute(pg_temp.v('lamp'), 'decline', 'Kamran took the lamp')::text);
select pg_temp.act_as(pg_temp.k());
select public.leave_apartment(pg_temp.v('flat'));
select pg_temp.act_as(pg_temp.a());
select lives_ok($$ select public.decide_dispute(pg_temp.v('lamp_dispute'), true, 'Kamran kept the lamp') $$,
  'an admin decides a dispute the creator can no longer answer');
select is(pg_temp.open_charges(pg_temp.v('lamp')), '', 'Kamran now carries the whole lamp, so nobody owes him for it');

-- Visibility and history ------------------------------------------------------------------

select pg_temp.act_as(pg_temp.o());
select is_empty($$ select 1 from public.disputes $$, 'an outsider sees no disputes');
reset role;
select throws_ok($$ delete from public.dispute_events $$, 'P0001', 'immutable_record', 'dispute history cannot be changed');
select is(
  (select sum(amount_minor)::bigint from private.apportion(1000000000000,
    '[{"user_id": "11111111-1111-1111-1111-111111111111", "weight": 999999999999},
      {"user_id": "22222222-2222-2222-2222-222222222222", "weight": 1}]'::jsonb)),
  1000000000000::bigint,
  'apportioning the largest amount by amount-sized weights stays exact'
);

select * from finish();

rollback;
