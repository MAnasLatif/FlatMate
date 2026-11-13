-- Editing and voiding posted expenses (SRS FR-03.7, decision record 0003).
begin;

select plan(33);

-- The ids sort Anas, Zubair, Ajmal, which decides who gets leftover units.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
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
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.everyone() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a()),
    jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.j()))
$$;
create function pg_temp.paid_by(payer uuid, amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', payer, 'amount_minor', amount))
$$;
-- The charges of an expense still in force, as "debtor>creditor:amount".
create function pg_temp.open_charges(expense uuid) returns text language sql as $$
  select coalesce(string_agg(left(c.debtor_id::text, 1) || '>' || left(c.creditor_id::text, 1) || ':' || c.amount_minor, ' '
    order by c.debtor_id, c.creditor_id), '')
  from public.ledger_entries c
  where c.expense_id = expense and c.kind = 'charge'
    and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = c.id)
$$;
-- What the entries of an expense add up to: charges minus their reversals.
create function pg_temp.net(expense uuid) returns bigint language sql as $$
  select coalesce(sum(case kind when 'charge' then amount_minor else -amount_minor end), 0)::bigint
  from public.ledger_entries where expense_id = expense
$$;
-- Edits the Cleaning expense as the current user, changing only what is passed.
create function pg_temp.edit_cleaning(
  expected integer, title text default 'Cleaning', amount bigint default 20000,
  method text default 'equal', participants jsonb default null, payers jsonb default null
) returns integer language sql as $$
  select public.edit_expense(
    pg_temp.v('cleaning'), expected, title, null, null, current_date, null, amount, method,
    coalesce(participants, pg_temp.everyone()), coalesce(payers, pg_temp.paid_by(pg_temp.a(), amount)))
$$;

-- Anas (admin) with Zubair and Ajmal. Anas pays Rs 200 for cleaning, split three ways (SRS 5.1).
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.o());
select public.create_apartment('Elsewhere', 1);

select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', public.post_expense(
  pg_temp.v('flat'), 'Cleaning', 20000, current_date, 'equal', pg_temp.everyone(),
  pg_temp.paid_by(pg_temp.a(), 20000))::text);

-- Who may edit ------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok($$ select pg_temp.edit_cleaning(1, 'Mine now') $$, '42501', 'not_allowed_to_edit_expense',
  'a member who did not add the expense cannot edit it');
select throws_ok($$ select public.void_expense(pg_temp.v('cleaning')) $$, '42501', 'not_allowed_to_edit_expense',
  'or void it');

select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select pg_temp.edit_cleaning(1, 'Mine now') $$, 'P0002', 'expense_not_found',
  'someone outside the apartment cannot see it to edit it');

-- Descriptive edits ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select is(pg_temp.edit_cleaning(1, 'Deep cleaning'), 1, 'renaming keeps the revision');
select is((select title from public.expenses where id = pg_temp.v('cleaning')), 'Deep cleaning', 'the new title is saved');
select is(
  (select details -> 'changes' -> 'title' from public.audit_events where entity_id = pg_temp.v('cleaning') and action = 'edited'),
  '{"from": "Cleaning", "to": "Deep cleaning"}'::jsonb,
  'the old and new title are logged'
);
select is(pg_temp.open_charges(pg_temp.v('cleaning')), '2>1:6667 3>1:6666', 'renaming does not touch the charges');
select is(pg_temp.edit_cleaning(1, 'Deep cleaning'), 1, 'repeating the same edit succeeds');
select is(
  (select count(*)::int from public.audit_events where entity_id = pg_temp.v('cleaning') and action = 'edited'),
  1,
  'and changes nothing'
);
select throws_ok($$ select public.edit_expense(pg_temp.v('cleaning'), 1, 'Deep cleaning', gen_random_uuid(), null,
    current_date, null, 20000, 'equal', pg_temp.everyone(), pg_temp.paid_by(pg_temp.a(), 20000)) $$,
  '22023', 'invalid_category', 'a category from nowhere is refused');

-- Money edits -------------------------------------------------------------------------------

select is(pg_temp.edit_cleaning(1, 'Deep cleaning', 30000), 2, 'changing the amount writes revision 2');
select is(pg_temp.open_charges(pg_temp.v('cleaning')), '2>1:10000 3>1:10000', 'only the new charges are in force');
select is(
  (select count(*)::int from public.ledger_entries r
   join public.ledger_entries c on c.id = r.reverses_entry_id
   where r.expense_id = pg_temp.v('cleaning') and r.kind = 'charge_reversal'
     and c.expense_revision = 1 and r.amount_minor = c.amount_minor and r.debtor_id = c.debtor_id),
  2,
  'each charge of revision 1 is cancelled by a reversal linked to it'
);
select is(pg_temp.net(pg_temp.v('cleaning')), 20000::bigint, 'the entries add up to what the others owe for revision 2');
select is(
  (select amount_minor || '/' || revision || '/' || status from public.expenses where id = pg_temp.v('cleaning')),
  '30000/2/provisional',
  'the expense shows the new amount and revision'
);
select is(pg_temp.edit_cleaning(1, 'Deep cleaning', 30000), 2,
  'repeating the edit after it succeeded changes nothing, even with the old revision');
select throws_ok($$ select pg_temp.edit_cleaning(1, 'Deep cleaning', 25000) $$, 'P0001', 'expense_changed',
  'a different money edit based on an old revision is refused');

select is(
  pg_temp.edit_cleaning(2, 'Deep cleaning', 30000, 'percentage', jsonb_build_array(
    jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 5000),
    jsonb_build_object('user_id', pg_temp.z(), 'basis_points', 2500),
    jsonb_build_object('user_id', pg_temp.j(), 'basis_points', 2500))),
  3,
  'switching to a 50/25/25 split writes revision 3'
);
select is(pg_temp.open_charges(pg_temp.v('cleaning')), '2>1:7500 3>1:7500', 'and charges by the new split (AC-03)');
select throws_ok($$ select pg_temp.edit_cleaning(3, 'Deep cleaning', 30000, 'equal', null, '[]'::jsonb) $$,
  '22023', 'no_payers', 'a paid expense keeps at least one payer');

-- A final expense that is edited can be objected to again.
reset role;
update public.expenses set status = 'final', finalized_at = now() where id = pg_temp.v('cleaning');
select pg_temp.act_as(pg_temp.a());
select pg_temp.edit_cleaning(3, 'Deep cleaning', 36000);
select ok(
  (select status = 'provisional' and finalized_at is null and finalize_after > now()
   from public.expenses where id = pg_temp.v('cleaning')),
  'editing the money of a final expense makes it provisional with a new objection window'
);

-- Disputes and voiding --------------------------------------------------------------------

reset role;
update public.expenses set status = 'disputed' where id = pg_temp.v('cleaning');
select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select pg_temp.edit_cleaning(4, 'Disputed cleaning') $$, 'P0001', 'expense_disputed',
  'a disputed expense cannot be edited');
select throws_ok($$ select public.void_expense(pg_temp.v('cleaning')) $$, 'P0001', 'expense_disputed',
  'or voided');
reset role;
update public.expenses set status = 'provisional' where id = pg_temp.v('cleaning');
select pg_temp.act_as(pg_temp.a());

select lives_ok($$ select public.void_expense(pg_temp.v('cleaning'), 'Added twice') $$, 'the creator voids the expense');
select is(pg_temp.net(pg_temp.v('cleaning')), 0::bigint, 'nobody owes anything for it any more');
select lives_ok($$ select public.void_expense(pg_temp.v('cleaning'), 'Added twice') $$, 'voiding again changes nothing');
select is(
  (select count(*)::int from public.audit_events where entity_id = pg_temp.v('cleaning') and action = 'voided'),
  1,
  'and is logged once'
);
select throws_ok($$ select pg_temp.edit_cleaning(4, 'Back again') $$, 'P0001', 'expense_void',
  'a void expense cannot be edited');

-- Admins, former members and unpaid bills ---------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('snacks', public.post_expense(
  pg_temp.v('flat'), 'Snacks', 900, current_date, 'equal', pg_temp.everyone(),
  pg_temp.paid_by(pg_temp.z(), 900))::text);
select pg_temp.act_as(pg_temp.j());
select public.leave_apartment(pg_temp.v('flat'));

select pg_temp.act_as(pg_temp.a());
select is(
  public.edit_expense(pg_temp.v('snacks'), 1, 'Snacks', null, null, current_date, null, 1200, 'equal',
    pg_temp.everyone(), pg_temp.paid_by(pg_temp.z(), 1200)),
  2,
  'an admin edits an expense someone else added, keeping a member who has left in the split'
);
select throws_ok($$ select public.edit_expense(pg_temp.v('snacks'), 2, 'Snacks', null, null, current_date, null, 1200,
    'equal', jsonb_build_array(jsonb_build_object('user_id', pg_temp.o())), pg_temp.paid_by(pg_temp.z(), 1200)) $$,
  '22023', 'participant_not_member', 'nobody from outside the apartment can be added');

create function pg_temp.flatmates() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()))
$$;
insert into vals values ('bill', public.post_expense(
  pg_temp.v('flat'), 'Electricity', 9000, current_date, 'equal', pg_temp.flatmates(), '[]'::jsonb)::text);
select throws_ok($$ select public.edit_expense(pg_temp.v('bill'), 1, 'Electricity', null, null, current_date, null, 9000,
    'equal', pg_temp.flatmates(), pg_temp.paid_by(pg_temp.a(), 9000)) $$,
  '22023', 'unpaid_bill_has_no_payers', 'an unpaid bill is paid through record_bill_payment, not an edit');
select is(
  public.edit_expense(pg_temp.v('bill'), 1, 'Electricity', null, null, current_date, null, 9300, 'equal',
    pg_temp.flatmates(), '[]'::jsonb),
  2,
  'the amount of an unpaid bill can be corrected'
);
select is(pg_temp.open_charges(pg_temp.v('bill')), '', 'and it still creates no debts');

select * from finish();

rollback;
