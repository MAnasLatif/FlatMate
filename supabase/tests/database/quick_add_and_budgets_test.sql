-- Quick-add templates, budgets and budget alerts (SRS FR-10.3).
begin;

select plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
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
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated, service_role;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.flat() returns uuid language sql as $$ select pg_temp.v('flat')::uuid $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Karachi')::date $$;
create function pg_temp.this_month() returns date language sql as $$ select date_trunc('month', pg_temp.today())::date $$;
create function pg_temp.both() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()))
$$;
create function pg_temp.anas_paid(amount bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', amount))
$$;
-- Budget notifications for the flat, as level counts: 'near:2,over:2'.
create function pg_temp.alerts() returns text language sql as $$
  select coalesce(string_agg(t || ':' || n, ',' order by t), '')
  from (
    select replace(replace(type, 'budget.near_limit', 'near'), 'budget.over_limit', 'over') as t, count(*) as n
    from public.notifications where apartment_id = pg_temp.flat() and type like 'budget.%'
    group by type
  ) c
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.flat()));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
reset role;
update public.apartments set timezone = 'Asia/Karachi' where id = pg_temp.flat();
insert into vals select 'groceries', id::text from public.expense_categories
where apartment_id = pg_temp.flat() and name = 'Groceries';
insert into vals select 'cleaning', id::text from public.expense_categories
where apartment_id = pg_temp.flat() and name = 'Cleaning';

-- Quick-add templates ---------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
insert into vals values ('milk', public.save_expense_template(
  pg_temp.flat(), '  Milk ', 'equal', p_category_id => pg_temp.v('groceries')::uuid)::text);
select is(
  (select title || ':' || coalesce(amount_minor::text, 'any') || ':' || (participants is null)::text
   from public.expense_templates where id = pg_temp.v('milk')::uuid),
  'Milk:any:true', 'a member saves a template; with no participants it is shared by everyone');

select is(
  public.save_expense_template(pg_temp.flat(), 'MILK', 'fixed', 12000, null, null,
    jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 2000),
                      jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 10000)))::text,
  pg_temp.v('milk'), 'saving under the same name, in any case, replaces it');
select is(
  (select title || ':' || amount_minor || ':' || split_method || ':' || coalesce(category_id::text, 'none')
   from public.expense_templates where id = pg_temp.v('milk')::uuid),
  'MILK:12000:fixed:none', 'with everything the new one says');
select is(
  (select count(*)::int from public.audit_events
   where entity_type = 'expense_template' and entity_id = pg_temp.v('milk')::uuid),
  2, 'each save is recorded, so other members'' apps refresh');

select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Bread', 'fixed') $$,
  '22023', 'fixed_split_needs_fixed_amount', 'fixed shares need an amount');
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Bread', 'percentage', 1000, null, null,
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'basis_points', 4000))) $$,
  '22023', null, 'percentages must add up');
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Bread', 'equal', null, null, null,
       jsonb_build_array(jsonb_build_object('user_id', pg_temp.o()))) $$,
  '22023', 'participant_not_member', 'only members can share in it');
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Bread', 'percentage') $$,
  '22023', 'invalid_split', 'only an equal split can leave out who shares it');
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Bread', 'equal', null, null, 'Rye') $$,
  '22023', 'category_detail_without_category', 'what Other was needs a category');
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), '   ', 'equal') $$,
  '22023', 'invalid_title', 'a template needs a name');

select pg_temp.act_as(pg_temp.a());
select public.archive_category(pg_temp.v('cleaning')::uuid);
select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Mop', 'equal', null, pg_temp.v('cleaning')::uuid) $$,
  '22023', 'invalid_category', 'an archived category cannot be chosen');

-- Someone an admin stopped from adding expenses cannot save or delete templates.
select pg_temp.act_as(pg_temp.a());
select public.set_member_can_add_expense(pg_temp.flat(), pg_temp.z(), false);
select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Eggs', 'equal') $$,
  '42501', 'not_allowed_to_add_expense', 'a member who may not add expenses cannot save templates');
select throws_ok(
  $$ select public.delete_expense_template(pg_temp.v('milk')::uuid) $$,
  '42501', 'not_allowed_to_add_expense', 'nor delete them');
select is((select count(*)::int from public.expense_templates where apartment_id = pg_temp.flat()), 1,
  'but still sees them');
select pg_temp.act_as(pg_temp.a());
select public.set_member_can_add_expense(pg_temp.flat(), pg_temp.z(), true);

select pg_temp.act_as(pg_temp.o());
select is((select count(*)::int from public.expense_templates where apartment_id = pg_temp.flat()), 0,
  'someone outside the apartment sees no templates');
select throws_ok(
  $$ select public.delete_expense_template(pg_temp.v('milk')::uuid) $$,
  'P0002', 'template_not_found', 'and cannot delete one');

select pg_temp.act_as(pg_temp.a());
select public.save_expense_template(pg_temp.flat(), 'Item ' || n, 'equal') from generate_series(2, 30) n;
select throws_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'One too many', 'equal') $$,
  '22023', 'too_many_templates', 'an apartment keeps at most 30 templates');
select lives_ok(
  $$ select public.save_expense_template(pg_temp.flat(), 'Item 2', 'equal', 500) $$,
  'but an existing one can still be replaced');

select public.delete_expense_template(pg_temp.v('milk')::uuid);
select is((select count(*)::int from public.expense_templates where id = pg_temp.v('milk')::uuid), 0,
  'any member who may add expenses deletes a template');

-- Budgets ---------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select throws_ok(
  $$ select public.set_budget(pg_temp.flat(), 100000) $$,
  '42501', 'not_admin', 'only admins set budgets');

select pg_temp.act_as(pg_temp.a());
insert into vals values ('overall', public.set_budget(pg_temp.flat(), 100000)::text);
insert into vals values ('food', public.set_budget(pg_temp.flat(), 50000, pg_temp.v('groceries')::uuid)::text);
select is(public.set_budget(pg_temp.flat(), 100000)::text, pg_temp.v('overall'),
  'setting a budget again changes the same one');
select throws_ok(
  $$ select public.set_budget(pg_temp.flat(), 0) $$,
  '22023', 'invalid_limit', 'a budget is more than nothing');

-- This month: groceries, an unpaid bill, a cancelled expense; last month: more groceries.
select public.post_expense(pg_temp.flat(), 'Groceries', 30000, pg_temp.this_month(), 'equal',
  pg_temp.both(), pg_temp.anas_paid(30000), pg_temp.v('groceries')::uuid);
select public.post_expense(pg_temp.flat(), 'Electricity', 20000, pg_temp.today(), 'equal',
  pg_temp.both(), '[]'::jsonb);
select public.void_expense(public.post_expense(pg_temp.flat(), 'Mistake', 90000, pg_temp.today(), 'equal',
  pg_temp.both(), pg_temp.anas_paid(90000), pg_temp.v('groceries')::uuid));
select public.post_expense(pg_temp.flat(), 'Old groceries', 70000, pg_temp.this_month() - 1, 'equal',
  pg_temp.both(), pg_temp.anas_paid(70000), pg_temp.v('groceries')::uuid);

select pg_temp.act_as(pg_temp.z());
select is(
  (select string_agg(coalesce(category_id::text, 'all') || ':' || limit_minor || ':' || spent_minor, ',')
   from public.get_budgets(pg_temp.flat(), pg_temp.this_month())),
  'all:100000:50000,' || pg_temp.v('groceries') || ':50000:30000',
  'members see each budget with the month''s spending: unpaid bills count, cancelled expenses and other months do not');
select throws_ok(
  $$ select * from public.get_budgets(pg_temp.flat(), pg_temp.this_month() + 3) $$,
  '22023', 'invalid_month', 'a month is given by its first day');
select pg_temp.act_as(pg_temp.o());
select throws_ok(
  $$ select * from public.get_budgets(pg_temp.flat(), pg_temp.this_month()) $$,
  '42501', 'not_member', 'someone outside the apartment sees no budgets');

-- Alerts ----------------------------------------------------------------------------------

reset role;
select is(private.send_budget_alerts(), 0, 'no alert below 80%');

select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.flat(), 'More groceries', 10000, pg_temp.today(), 'equal',
  pg_temp.both(), pg_temp.anas_paid(10000), pg_temp.v('groceries')::uuid);
reset role;
select private.send_budget_alerts();
select private.send_budget_alerts();
select is(pg_temp.alerts(), 'near:2', 'reaching 80% tells every member once, however often the job runs');

-- The whole apartment jumps past 100% at once: only that alert goes out.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.flat(), 'Repairs', 50000, pg_temp.today(), 'equal',
  pg_temp.both(), pg_temp.anas_paid(50000));
reset role;
select private.send_budget_alerts();
select is(pg_temp.alerts(), 'near:2,over:2', 'jumping past the cap sends only the 100% alert');
select is(private.notification_category('budget.over_limit'), 'budgets', 'budget alerts are their own push group');

-- Raising a cap starts its alerts afresh: 100000 of 120000 is past 80%.
select pg_temp.act_as(pg_temp.a());
select public.set_budget(pg_temp.flat(), 120000);
reset role;
select private.send_budget_alerts();
select is(pg_temp.alerts(), 'near:4,over:2', 'a changed cap alerts again at the level now reached');

select pg_temp.act_as(pg_temp.a());
select public.remove_budget(pg_temp.flat(), pg_temp.v('groceries')::uuid);
select is((select count(*)::int from public.budgets where apartment_id = pg_temp.flat()), 1,
  'an admin removes a budget');

select * from finish();

rollback;
