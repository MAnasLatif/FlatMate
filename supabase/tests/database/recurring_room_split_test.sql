-- Repeatable expenses split by room (SRS FR-10.6, FR-04).
begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}');

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
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.everyone() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()))
$$;
-- Charges one period of a template, as the scheduled job does, from a given bill date.
create function pg_temp.charge(template text, bill_date date) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  update public.recurring_templates set next_bill_date = bill_date where id = pg_temp.v(template)::uuid;
  perform private.charge_next_period(pg_temp.v(template)::uuid);
end;
$$;
-- The latest instance of a template.
create function pg_temp.instance(template text) returns public.recurring_instances language sql as $$
  select * from public.recurring_instances where template_id = pg_temp.v(template)::uuid
  order by bill_date desc limit 1
$$;
-- A charge's split, by name, as 'Anas:180000,…'.
create function pg_temp.split_of(expense uuid) returns text language sql as $$
  select string_agg(n.name || ':' || s.amount_minor, ',' order by n.name)
  from public.expense_splits s
  join (values (pg_temp.a(), 'Anas'), (pg_temp.z(), 'Zubair'), (pg_temp.y(), 'Yasir')) n (user_id, name)
    on n.user_id = s.user_id
  where s.expense_id = expense
    and s.revision = (select revision from public.expenses where id = expense)
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

-- The days a charge covers -----------------------------------------------------------------

reset role;
select is((select starts_on || '/' || ends_on from private.recurring_room_period('2026-11-01', 'month', 1, 1, 'advance')),
  '2026-11-01/2026-11-30', 'in advance: from the bill date to the day before the next');
select is((select starts_on || '/' || ends_on from private.recurring_room_period('2026-12-05', 'month', 1, 5, 'arrears')),
  '2026-11-05/2026-12-04', 'in arrears: from the previous bill date to the day before this one');
select is((select starts_on || '/' || ends_on from private.recurring_room_period('2027-02-28', 'month', 3, 31, 'arrears')),
  '2026-11-30/2027-02-27', 'a bill day of 31 follows short months');
select is((select starts_on || '/' || ends_on from private.recurring_room_period('2026-11-02', 'week', 2, null, 'advance')),
  '2026-11-02/2026-11-15', 'fortnightly in advance');
select is((select starts_on || '/' || ends_on from private.recurring_room_period('2026-11-02', 'day', 1, null, 'arrears')),
  '2026-11-01/2026-11-01', 'daily in arrears is the day before');

-- Templates --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.flat(), 'Rent', 'fixed', 300000, 'month', 1, 1, null,
       'room', '[]'::jsonb, p_room_period => 'advance') $$,
  '22023', 'no_rooms', 'a split by room needs a room');

insert into vals values ('master', public.save_room(pg_temp.flat(), 'Master', 3)::text);
insert into vals values ('small', public.save_room(pg_temp.flat(), 'Small', 2)::text);
select public.add_room_occupant(pg_temp.v('master')::uuid, pg_temp.a(), '2026-01-01');
select public.add_room_occupant(pg_temp.v('small')::uuid, pg_temp.z(), '2026-01-01');
select public.add_room_occupant(pg_temp.v('small')::uuid, pg_temp.y(), '2026-01-01');

select throws_ok(
  $$ select public.create_recurring_template(pg_temp.flat(), 'Rent', 'fixed', 300000, 'month', 1, 1, null,
       'room', '[]'::jsonb) $$,
  '22023', 'invalid_room_period', 'a split by room says which days it covers');
select throws_ok(
  $$ select public.create_recurring_template(pg_temp.flat(), 'Rent', 'fixed', 300000, 'month', 1, 1, null,
       'equal', pg_temp.everyone(), p_room_period => 'advance') $$,
  '22023', 'room_period_without_room_split', 'only a split by room has a period');

insert into vals values ('rent', public.create_recurring_template(pg_temp.flat(), 'Rent', 'fixed', 300000,
  'month', 1, 1, null, 'room', pg_temp.everyone(), p_room_period => 'advance')::text);
select is(
  (select split_method || ':' || room_period || ':' || participants::text
   from public.recurring_templates where id = pg_temp.v('rent')::uuid),
  'room:advance:[]', 'an admin sets up rent split by room in advance, naming nobody ahead');

-- Charging a fixed amount ------------------------------------------------------------------

select pg_temp.charge('rent', '2026-11-01');
select is((pg_temp.instance('rent')).state, 'posted', 'the job charges rent split by room at once');
select is(pg_temp.split_of((pg_temp.instance('rent')).expense_id),
  'Anas:180000,Yasir:60000,Zubair:60000', 'by room weight, Small shared by its two people');
select is(
  (select description || ':' || paid_status from public.expenses where id = (pg_temp.instance('rent')).expense_id),
  'Split by room for 1 Nov 2026 – 30 Nov 2026.:unpaid', 'the charge says which days it covers');
select is(
  (select split_method from public.expense_revisions where expense_id = (pg_temp.instance('rent')).expense_id),
  'fixed', 'and is saved as a split by amount');

-- Yasir leaves without his move-out recorded: his days would be left out.
select pg_temp.act_as(pg_temp.y());
select public.leave_apartment(pg_temp.flat());
select pg_temp.charge('rent', '2026-12-01');
select is(
  (select state || ':' || reason from public.recurring_instances where id = (pg_temp.instance('rent')).id),
  'waiting:split_needs_review', 'a split that would leave out someone''s days waits for an admin');
select is(
  (select count(*)::int from public.audit_events
   where entity_type = 'recurring_bill' and entity_id = (pg_temp.instance('rent')).id and action = 'needs_review'),
  1, 'and the admins are told');

select pg_temp.act_as(pg_temp.a());
insert into vals values ('december', public.post_recurring_bill((pg_temp.instance('rent')).id, 300000, 'room',
  '[]'::jsonb, null, null)::text);
select is(pg_temp.split_of(pg_temp.v('december')::uuid), 'Anas:180000,Zubair:120000',
  'an admin enters it split by room: Zubair now has Small alone');
select is(
  (select description from public.expenses where id = pg_temp.v('december')::uuid),
  'Split by room for 1 Dec 2026 – 31 Dec 2026.', 'with its period noted');
select is(
  public.post_recurring_bill((pg_temp.instance('rent')).id, 300000, 'room', '[]'::jsonb, null, null)::text,
  pg_temp.v('december'), 'a retried entry returns the same charge');

-- A period nobody lived in.
insert into vals values ('old', public.create_recurring_template(pg_temp.flat(), 'Old rent', 'fixed', 1000,
  'month', 1, 1, null, 'room', '[]'::jsonb, p_room_period => 'advance')::text);
select pg_temp.charge('old', '2025-01-01');
select is((pg_temp.instance('old')).reason, 'split_needs_review', 'a period nobody lived in waits for an admin');
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  format($$ select public.post_recurring_bill(%L, 1000, 'room', '[]'::jsonb, null, null) $$, (pg_temp.instance('old')).id),
  '22023', 'no_occupants', 'and cannot be split by room');

-- A variable bill ----------------------------------------------------------------------

insert into vals values ('power', public.create_recurring_template(pg_temp.flat(), 'Electricity', 'variable', null,
  'month', 1, 5, null, 'room', '[]'::jsonb, p_room_period => 'arrears')::text);
select pg_temp.charge('power', '2026-12-05');
select is((pg_temp.instance('power')).reason, 'amount_needed', 'a variable bill still waits for its amount');
select pg_temp.act_as(pg_temp.a());
insert into vals values ('power_bill', public.post_recurring_bill((pg_temp.instance('power')).id, 10000, 'room',
  '[]'::jsonb, null, null)::text);
select is(pg_temp.split_of(pg_temp.v('power_bill')::uuid), 'Anas:6000,Zubair:4000',
  'the server splits the amount by room for the month before');
select is(
  (select description from public.expenses where id = pg_temp.v('power_bill')::uuid),
  'Split by room for 5 Nov 2026 – 4 Dec 2026.', 'in arrears');

-- Changing a template ----------------------------------------------------------------------

select public.update_recurring_template(pg_temp.v('rent')::uuid, 'Rent', 300000, 'month', 1, 1, null,
  'equal', pg_temp.everyone());
select is(
  (select split_method || ':' || coalesce(room_period, 'none') from public.recurring_templates where id = pg_temp.v('rent')::uuid),
  'equal:none', 'an admin changes it back to an equal split');
select public.update_recurring_template(pg_temp.v('rent')::uuid, 'Rent', 300000, 'month', 1, 1, null,
  'room', pg_temp.everyone(), null, 'arrears');
select is(
  (select split_method || ':' || room_period || ':' || participants::text
   from public.recurring_templates where id = pg_temp.v('rent')::uuid),
  'room:arrears:[]', 'or to a split by room in arrears');
select throws_ok(
  format($$ select public.update_recurring_template(%L, 'Rent', 300000, 'month', 1, 1, null, 'room', '[]'::jsonb) $$,
    pg_temp.v('rent')),
  '22023', 'invalid_room_period', 'a split by room still needs its period');

-- A member cannot see templates, nor post bills.
select pg_temp.act_as(pg_temp.z());
select throws_ok(
  format($$ select public.post_recurring_bill(%L, 1000, 'room', '[]'::jsonb, null, null) $$, (pg_temp.instance('old')).id),
  'P0002', 'recurring_bill_not_found', 'only admins enter bills');

select * from finish();
rollback;
