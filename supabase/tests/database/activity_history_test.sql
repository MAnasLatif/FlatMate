-- Activity history (SRS FR-10.8).
begin;

select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'yasir@example.test', '{"display_name": "Yasir"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

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
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
-- The caller's timeline, as "entity.action" from newest.
create function pg_temp.timeline(p_group text default null, p_actor uuid default null) returns text language sql as $$
  select coalesce(string_agg(entity_type || '.' || action, ',' order by id desc), '')
  from public.get_activity(pg_temp.flat(), p_group, p_actor, null, 100)
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.y());
select pg_temp.join(pg_temp.v('code'));

select pg_temp.act_as(pg_temp.a());
insert into vals values ('snacks', public.post_expense(pg_temp.flat(), 'Snacks', 30000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
                    jsonb_build_object('user_id', pg_temp.y())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 30000)))::text);
select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.flat(), pg_temp.a(), 10000)::text);
select public.raise_dispute(pg_temp.v('snacks')::uuid, 'adjustment', 'I had none', 0);

-- Who sees which entries ----------------------------------------------------------------------

select pg_temp.act_as(pg_temp.y());
select is(
  (select count(*)::int from public.audit_events where entity_type = 'payment'), 0,
  'a member sees nothing of a payment between others');
select is(
  (select count(*)::int from public.audit_events where entity_type in ('invite', 'join_request')), 0,
  'nor the admins'' join codes and requests');
select is(
  (select count(*)::int from public.audit_events where entity_type = 'expense' and entity_id = pg_temp.v('snacks')::uuid), 2,
  'but every member still sees an expense''s history, disputes included');

select pg_temp.act_as(pg_temp.z());
select is(
  (select count(*)::int from public.audit_events where entity_type = 'payment'), 1,
  'the payer sees their payment''s history');
select pg_temp.act_as(pg_temp.a());
select is(
  (select count(*)::int from public.audit_events where entity_type = 'payment'), 1, 'and so do the recipient and admins');
select ok(
  (select count(*) from public.audit_events where entity_type = 'join_request') > 0, 'admins see requests to join');

-- The timeline ----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.y());
select is(pg_temp.timeline(), 'expense.dispute_raised,expense.created,member.joined,member.joined,apartment.created',
  'a member''s timeline is newest first, without what they may not see');

select pg_temp.act_as(pg_temp.a());
select is(
  (select subject || ':' || amount_minor from public.get_activity(pg_temp.flat(), 'expenses')),
  'Snacks:30000', 'an expense entry names the expense and its amount');
select is(
  (select person_id::text || ':' || counterparty_id::text || ':' || amount_minor
   from public.get_activity(pg_temp.flat(), 'payments')),
  pg_temp.z() || ':' || pg_temp.a() || ':10000', 'a payment entry names who paid whom, and how much');
select is(pg_temp.timeline('disputes'), 'expense.dispute_raised', 'disputes are a filter of their own');
select is(pg_temp.timeline(null, pg_temp.z()),
  'expense.dispute_raised,payment.recorded,member.joined,join_request.requested',
  'the timeline can show what one person did');
select is(
  (select array_agg(distinct person_id) from public.get_activity(pg_temp.flat(), 'members', pg_temp.z())),
  array[pg_temp.z()], 'a member or join request entry names the person it is about');

select is(
  (select string_agg(entity_type || '.' || action, ',' order by id desc)
   from public.get_activity(pg_temp.flat(), null, null,
     (select min(id) from public.get_activity(pg_temp.flat(), null, null, null, 3)), 3)),
  (select string_agg(entity_type || '.' || action, ',' order by id desc)
   from (select * from public.get_activity(pg_temp.flat(), null, null, null, 6) order by id desc offset 3) rest),
  'the next page continues after the last entry of the previous one');

select throws_ok(
  $$ select * from public.get_activity(pg_temp.flat(), 'everything') $$,
  '22023', 'invalid_group', 'an unknown filter is refused');

select pg_temp.act_as(pg_temp.o());
select throws_ok(
  $$ select * from public.get_activity(pg_temp.flat()) $$,
  '42501', 'not_member', 'someone outside the apartment has no timeline');

select pg_temp.act_as(pg_temp.y());
select public.leave_apartment(pg_temp.flat());
select throws_ok(
  $$ select * from public.get_activity(pg_temp.flat()) $$,
  '42501', 'not_member', 'nor does a former member');

select * from finish();

rollback;
