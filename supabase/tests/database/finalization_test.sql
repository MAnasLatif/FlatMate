-- The objection window and the job that closes it (SRS FR-05.5, AC-06).
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
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;

create function pg_temp.post(title text) returns uuid language sql as $$
  select public.post_expense(
    pg_temp.v('flat'), title, 1000, current_date, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 1000)))
$$;
create function pg_temp.status(expense uuid) returns text language sql as $$
  select status from public.expenses where id = expense
$$;

-- A flat in Karachi (the default timezone) with a 7-day window.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));
select pg_temp.act_as(pg_temp.a());
insert into vals values ('cleaning', pg_temp.post('Cleaning')::text);
insert into vals values ('snacks', pg_temp.post('Snacks')::text);
insert into vals values ('rent', pg_temp.post('Rent')::text);

-- When the window closes --------------------------------------------------------------------

select is(
  (select (finalize_after at time zone 'Asia/Karachi')::time from public.expenses where id = pg_temp.v('cleaning')),
  '00:00'::time,
  'the window closes at midnight in the apartment''s timezone'
);
select is(
  (select (finalize_after at time zone 'Asia/Karachi')::date from public.expenses where id = pg_temp.v('cleaning')),
  (now() at time zone 'Asia/Karachi')::date + 8,
  'after the whole seventh day'
);

reset role;
update public.apartments set timezone = 'America/New_York' where id = pg_temp.v('flat');
update public.expenses set finalize_after = now() + interval '7 days' where id = pg_temp.v('rent');
select is(
  (select (finalize_after at time zone 'America/New_York')::time from public.expenses where id = pg_temp.v('rent')),
  '00:00'::time,
  'in whichever timezone the apartment uses'
);
-- Writing the same midnight again must not push it a day later.
update public.expenses set finalize_after = finalize_after where id = pg_temp.v('rent');
select ok(
  (select (finalize_after at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date + 8
   from public.expenses where id = pg_temp.v('rent')),
  'rounding is not applied twice'
);

-- Finalizing --------------------------------------------------------------------------------

-- Cleaning's window closed; Snacks' closed too, but it is disputed; Rent's is open.
update public.expenses set finalize_after = now() - interval '2 days'
where id in (pg_temp.v('cleaning'), pg_temp.v('snacks'));
update public.expenses set status = 'disputed' where id = pg_temp.v('snacks');

select is(private.finalize_due_expenses(), 1, 'the job finalizes the one expense whose window has closed');
select is(
  pg_temp.status(pg_temp.v('cleaning')) || '/' || pg_temp.status(pg_temp.v('snacks')) || '/' || pg_temp.status(pg_temp.v('rent')),
  'final/disputed/provisional',
  'a disputed expense is held and an open window stays open (AC-06)'
);
select ok(
  (select finalized_at is not null from public.expenses where id = pg_temp.v('cleaning')),
  'it records when'
);
select is(
  (select count(*)::int from public.audit_events where entity_id = pg_temp.v('cleaning') and action = 'finalized'),
  1,
  'and logs it'
);
select is(private.finalize_due_expenses(), 0, 'running it again finalizes nothing');

select pg_temp.act_as(pg_temp.z());
select is(
  (select final_minor::text || '/' || provisional_minor from public.get_my_balances(pg_temp.v('flat'))),
  '500/500',
  'what Zubair owes for cleaning is now final; rent is still provisional'
);

-- Scheduling --------------------------------------------------------------------------------

reset role;
select ok(
  exists (select 1 from cron.job where jobname = 'finalize-expenses' and schedule = '*/5 * * * *')
  and not has_function_privilege('authenticated', 'private.finalize_due_expenses()', 'execute'),
  'the job runs every five minutes and nobody signed in can call it'
);

select * from finish();

rollback;
