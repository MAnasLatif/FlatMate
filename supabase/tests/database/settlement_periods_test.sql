-- Settlement periods (SRS FR-08.1, FR-08.5, FR-08.6, AC-10, section 12 item 9).
begin;

select plan(17);

-- Dates -------------------------------------------------------------------------------------

select is(private.settlement_date('2026-02-10', 31), '2026-02-28'::date, 'day 31 falls on 28 February');
select is(private.settlement_date('2028-02-10', 30), '2028-02-29'::date, 'and on the 29th in a leap year');
select is(private.next_settlement_date('2026-01-31', 31), '2026-02-28'::date, 'after 31 January comes 28 February');
select is(private.next_settlement_date('2026-02-28', 31), '2026-03-31'::date, 'and then 31 March');
select is(private.previous_settlement_date('2026-11-14', 15), '2026-10-15'::date, 'the period around 14 November started on 15 October');
select is(private.next_settlement_date('2026-11-01', 1) - 1, '2026-11-30'::date, 'a period from the 1st ends on the last day of the month');

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
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns uuid language sql as $$ select val::uuid from vals where name = key $$;
create function pg_temp.periods() returns text language sql as $$
  select string_agg(starts_on || '..' || ends_on || ':' || state, ' ' order by starts_on)
  from public.settlement_periods where apartment_id = pg_temp.v('flat')
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat'))::text);
select pg_temp.act_as(pg_temp.z());
select public.join_apartment((select val from vals where name = 'code'));

-- Opening ------------------------------------------------------------------------------------

reset role;
select is(
  (select starts_on || '..' || ends_on from public.settlement_periods where apartment_id = pg_temp.v('flat')),
  private.previous_settlement_date((now() at time zone 'Asia/Karachi')::date, 1) || '..'
    || (private.next_settlement_date(private.previous_settlement_date((now() at time zone 'Asia/Karachi')::date, 1), 1) - 1),
  'a new apartment starts with the period around today'
);

-- Anas pays Rs 200 for cleaning shared with Zubair, who pays back Rs 40.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat'), 'Cleaning', 20000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 20000)));
select pg_temp.act_as(pg_temp.z());
select public.record_payment(pg_temp.v('flat'), pg_temp.a(), 4000);

-- Closing --------------------------------------------------------------------------------------

-- Pretend the open period ended two months ago, so the job has catching up to do.
reset role;
update public.settlement_periods set starts_on = '2026-08-01', ends_on = '2026-08-31' where apartment_id = pg_temp.v('flat');
select ok(private.close_due_periods() >= 3, 'the job closes the overdue period and every period after it that has ended');
select ok(
  (select count(*) = 1 and bool_and(ends_on >= (now() at time zone 'Asia/Karachi')::date)
   from public.settlement_periods where apartment_id = pg_temp.v('flat') and state = 'open'),
  'leaving one open period that includes today'
);
select is(
  (select string_agg(starts_on || '..' || ends_on, ' ' order by starts_on) from public.settlement_periods
   where apartment_id = pg_temp.v('flat') and starts_on < '2026-11-01'),
  '2026-08-01..2026-08-31 2026-09-01..2026-09-30 2026-10-01..2026-10-31',
  'periods follow each other with no gap'
);
select is(
  (select final_minor || '/' || provisional_minor from public.settlement_balances b
   join public.settlement_periods p on p.id = b.period_id
   where p.apartment_id = pg_temp.v('flat') and p.starts_on = '2026-08-01'),
  '0/-6000',
  'the snapshot keeps what they owed by state: Zubair owed Anas Rs 60, provisionally'
);
select is(private.close_due_periods(), 0, 'running the job again closes nothing');

select pg_temp.act_as(pg_temp.z());
select is(
  (select final_minor + provisional_minor from public.get_my_balances(pg_temp.v('flat')))::bigint,
  6000::bigint,
  'closing zeroes nothing: Zubair still owes Rs 60, carried forward (FR-08.5)'
);

-- A new settlement day applies from the next period --------------------------------------------

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat9', public.create_apartment('Flat 9', 1)::text);
reset role;
-- Flat 9's open period is October; the settlement day then changes to the 15th.
update public.settlement_periods set starts_on = '2026-10-01', ends_on = '2026-10-31'
where apartment_id = pg_temp.v('flat9') and state = 'open';
update public.apartments set settlement_day = 15 where id = pg_temp.v('flat9');
select private.close_due_periods();
select ok(
  exists (select 1 from public.settlement_periods where apartment_id = pg_temp.v('flat9')
          and starts_on = '2026-11-01' and ends_on = '2026-11-14'),
  'after a change to the 15th the next period runs to the 14th, then from the 15th (AC-10)'
);

-- Who can see --------------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.z());
select ok((select count(*) > 0 from public.settlement_balances), 'Zubair sees the closing balances he is part of');
select pg_temp.act_as(pg_temp.o());
select is_empty($$ select 1 from public.settlement_periods where apartment_id = pg_temp.v('flat') $$,
  'someone outside the apartment sees no periods');
reset role;
select throws_ok($$ delete from public.settlement_balances $$, 'P0001', 'immutable_record', 'closing balances cannot be changed (FR-08.6)');

select * from finish();

rollback;
