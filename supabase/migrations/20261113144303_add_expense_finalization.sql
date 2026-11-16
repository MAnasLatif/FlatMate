-- The objection window (SRS FR-05.5, FR-05.6, AC-06, decision record 0004).
--
-- An expense is accepted by default. If nobody objects before its window
-- closes, a scheduled job makes it final. Windows close at midnight in the
-- apartment's timezone, so "until 20 Nov" means the whole of 20 Nov where the
-- flat is. Objections after that are late adjustment cases (raise_dispute).

-- Every function that opens a window sets finalize_after to now() plus the
-- apartment's approval days. This rounds it up to the next local midnight,
-- in one place. A value already on a midnight stays where it is.
create function private.close_window_at_local_midnight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  zone text;
begin
  select a.timezone into zone from public.apartments a where a.id = new.apartment_id;
  new.finalize_after :=
    (date_trunc('day', (new.finalize_after at time zone zone) - interval '1 microsecond') + interval '1 day')
    at time zone zone;
  return new;
end;
$$;

revoke execute on function private.close_window_at_local_midnight() from public;

create trigger expenses_window_closes_at_midnight
before insert or update of finalize_after on public.expenses
for each row execute function private.close_window_at_local_midnight();

-- Windows that are already open close at midnight too.
update public.expenses set finalize_after = finalize_after where status = 'provisional';

-- Makes provisional expenses whose window has closed final, and logs each
-- one. Disputed expenses are held and wait. Running it twice, or two runs at
-- once, finalizes nothing twice: rows another transaction holds are left for
-- the next run. Returns how many expenses it finalized.
create function private.finalize_due_expenses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  finalized_count integer;
begin
  with due as (
    update public.expenses e
    set status = 'final', finalized_at = now()
    where e.id in (
      select x.id from public.expenses x
      where x.status = 'provisional' and x.finalize_after <= now()
      order by x.finalize_after
      limit 1000
      for update skip locked
    )
    returning e.id, e.apartment_id
  ),
  logged as (
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
    select due.apartment_id, null, 'expense', due.id, 'finalized' from due
    returning 1
  )
  select count(*)::integer into finalized_count from logged;
  return finalized_count;
end;
$$;

revoke execute on function private.finalize_due_expenses() from public;

-- Scheduling ------------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Every five minutes, so an expense becomes final within minutes of its deadline.
select cron.schedule('finalize-expenses', '*/5 * * * *', $$ select private.finalize_due_expenses() $$);

-- pg_cron keeps every run forever. Two weeks is enough to look into a failure.
select cron.schedule(
  'prune-cron-history',
  '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);
