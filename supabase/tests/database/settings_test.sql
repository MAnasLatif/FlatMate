-- Apartment settings and expense categories.
begin;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.flat() returns uuid language sql as $$ select val::uuid from vals where name = 'flat' $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.join_apartment((select val from vals where name = 'code'));

-- Settings -------------------------------------------------------------------------------

select throws_ok(
  $$ select public.update_apartment_settings(pg_temp.flat(), 'Taken', null, false, 'Asia/Karachi', 1, 7) $$,
  '42501', 'not_admin',
  'a member who is not an admin cannot change the settings'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ select public.update_apartment_settings(pg_temp.flat(), ' Flat 4B, Gulberg ', ' Lahore ', true, 'Asia/Dubai', 28, 10) $$,
  'an admin can change the settings'
);

select results_eq(
  $$ select name, location, show_location, timezone, settlement_day::int, approval_days::int, currency
     from public.apartments where id = pg_temp.flat() $$,
  $$ values ('Flat 4B, Gulberg'::text, 'Lahore'::text, true, 'Asia/Dubai'::text, 28, 10, 'PKR'::text) $$,
  'the new settings are saved, trimmed, and the currency is unchanged'
);

select is(
  (select details -> 'before' ->> 'settlement_day' || ' -> ' || (details -> 'after' ->> 'settlement_day')
   from public.audit_events where action = 'settings_changed'),
  '1 -> 28',
  'the change is logged with the values before and after'
);

select lives_ok(
  $$ select public.update_apartment_settings(pg_temp.flat(), 'Flat 4B, Gulberg', 'Lahore', true, 'Asia/Dubai', 28, 10) $$,
  'saving unchanged settings succeeds'
);

select is(
  (select count(*)::int from public.audit_events where action = 'settings_changed'),
  1,
  'saving unchanged settings logs nothing'
);

select throws_ok(
  $$ select public.update_apartment_settings(pg_temp.flat(), 'Flat', null, false, 'Asia/Dubai', 1, 31) $$,
  '23514', null,
  'an objection window over 30 days is rejected'
);

-- Categories -------------------------------------------------------------------------------

select results_eq(
  $$ select name from public.expense_categories where apartment_id = pg_temp.flat() order by name $$,
  $$ values ('Cleaning'::text), ('Groceries'), ('Household'), ('Internet'), ('Maintenance'), ('Other'), ('Rent'), ('Utilities') $$,
  'a new apartment starts with the default categories'
);

insert into vals values ('gas', public.add_category(pg_temp.flat(), ' Gas ')::text);

select is(
  (select name from public.expense_categories where id = (select val::uuid from vals where name = 'gas')),
  'Gas',
  'an admin can add a category'
);

select throws_ok(
  $$ select public.add_category(pg_temp.flat(), 'gas') $$,
  '23505', null,
  'two active categories cannot share a name, whatever the case'
);

select lives_ok(
  format('select public.rename_category(%L, %L)', (select val from vals where name = 'gas'), 'Gas bill'),
  'an admin can rename a category'
);

select lives_ok(
  format('select public.archive_category(%L)', (select val from vals where name = 'gas')),
  'an admin can archive a category'
);

select lives_ok(
  $$ select public.add_category(pg_temp.flat(), 'Gas bill') $$,
  'an archived name can be used again'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ select public.add_category(pg_temp.flat(), 'Snacks') $$,
  '42501', 'not_admin',
  'a member who is not an admin cannot add categories'
);

select * from finish();

rollback;
