-- Settlement periods (SRS FR-08.1 to FR-08.6, AC-10, section 12 item 9,
-- decision record 0006).
--
-- A period runs from the apartment's settlement day to the day before the
-- next one; a settlement day of 29 to 31 falls on the last day of shorter
-- months. Each period stores its own dates, so a new settlement day applies
-- from the next period. A scheduled job closes a period once its last day has
-- passed in the apartment's timezone: it records an immutable snapshot of
-- every pair's balance and opens the next period. Nothing is zeroed; the
-- ledger is continuous, so unpaid and unresolved amounts carry forward.

-- Dates -----------------------------------------------------------------------------------

-- The settlement date in the month of p_month: the settlement day, or the
-- month's last day when the month is shorter.
create function private.settlement_date(p_month date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_month)::date
    + least(p_day, extract(day from date_trunc('month', p_month) + interval '1 month - 1 day')::integer) - 1
$$;

-- The first settlement date after p_after.
create function private.next_settlement_date(p_after date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when private.settlement_date(p_after, p_day) > p_after then private.settlement_date(p_after, p_day)
    else private.settlement_date((date_trunc('month', p_after) + interval '1 month')::date, p_day)
  end
$$;

-- The last settlement date on or before p_on.
create function private.previous_settlement_date(p_on date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when private.settlement_date(p_on, p_day) <= p_on then private.settlement_date(p_on, p_day)
    else private.settlement_date((date_trunc('month', p_on) - interval '1 month')::date, p_day)
  end
$$;

revoke execute on function private.settlement_date(date, integer) from public;
revoke execute on function private.next_settlement_date(date, integer) from public;
revoke execute on function private.previous_settlement_date(date, integer) from public;

-- Tables ----------------------------------------------------------------------------------

create table public.settlement_periods (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  state text not null default 'open',
  closed_at timestamptz,
  -- Disputes and payment objections still open when the period closed.
  open_dispute_count integer,
  created_at timestamptz not null default now(),
  constraint settlement_periods_dates_valid check (ends_on >= starts_on),
  constraint settlement_periods_state_valid check (state in ('open', 'closed')),
  constraint settlement_periods_closed_valid check (
    (state = 'closed') = (closed_at is not null and open_dispute_count is not null)
  ),
  constraint settlement_periods_start_unique unique (apartment_id, starts_on)
);

create unique index settlement_periods_one_open on public.settlement_periods (apartment_id) where state = 'open';
create index settlement_periods_due on public.settlement_periods (ends_on) where state = 'open';

-- What each pair owed each other when a period closed, by state. Positive:
-- member_a owed member_b. member_a always sorts before member_b.
create table public.settlement_balances (
  period_id uuid not null references public.settlement_periods (id) on delete cascade,
  member_a uuid not null references public.profiles (id) on delete restrict,
  member_b uuid not null references public.profiles (id) on delete restrict,
  final_minor bigint not null,
  provisional_minor bigint not null,
  disputed_minor bigint not null,
  primary key (period_id, member_a, member_b),
  constraint settlement_balances_pair_ordered check (member_a < member_b)
);

create index settlement_balances_member_a on public.settlement_balances (member_a);
create index settlement_balances_member_b on public.settlement_balances (member_b);

create trigger settlement_balances_immutable before update or delete on public.settlement_balances
for each row execute function private.reject_change();

alter table public.settlement_periods enable row level security;
alter table public.settlement_balances enable row level security;
revoke all on table public.settlement_periods, public.settlement_balances from anon, authenticated;
grant select on table public.settlement_periods, public.settlement_balances to authenticated;

create policy "Members and former members can read their apartment's periods"
on public.settlement_periods
for select
to authenticated
using ((select private.has_membership_history(apartment_id)));

-- Like payments, what two people owed each other is theirs and the admins' to see.
create policy "People in a pair and admins can read its closing balances"
on public.settlement_balances
for select
to authenticated
using (
  member_a = (select auth.uid())
  or member_b = (select auth.uid())
  or exists (
    select 1 from public.settlement_periods p
    where p.id = period_id and (select private.is_apartment_admin(p.apartment_id))
  )
);

-- Opening and closing ---------------------------------------------------------------------

-- Makes sure the apartment has an open period, starting from the last
-- settlement date on or before today in its timezone. Returns it.
create function private.ensure_open_period(p_apartment_id uuid)
returns public.settlement_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  apartment public.apartments;
  period public.settlement_periods;
  today date;
  starts date;
begin
  select * into period from public.settlement_periods where apartment_id = p_apartment_id and state = 'open';
  if period.id is not null then
    return period;
  end if;
  select * into apartment from public.apartments where id = p_apartment_id;
  today := (now() at time zone apartment.timezone)::date;
  starts := private.previous_settlement_date(today, apartment.settlement_day);
  insert into public.settlement_periods (apartment_id, starts_on, ends_on)
  values (p_apartment_id, starts, private.next_settlement_date(starts, apartment.settlement_day) - 1)
  on conflict do nothing
  returning * into period;
  if period.id is null then
    select * into period from public.settlement_periods where apartment_id = p_apartment_id and state = 'open';
  end if;
  return period;
end;
$$;

create function private.open_first_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_open_period(new.id);
  return new;
end;
$$;

create trigger apartments_open_first_period after insert on public.apartments
for each row execute function private.open_first_period();

-- Closes one period: snapshots every pair's balance, records how many
-- disputes are still open, and opens the next period with the apartment's
-- current settlement day.
create function private.close_period(p_period public.settlement_periods)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  apartment public.apartments;
  next_start date := p_period.ends_on + 1;
begin
  select * into apartment from public.apartments where id = p_period.apartment_id;

  insert into public.settlement_balances (period_id, member_a, member_b, final_minor, provisional_minor, disputed_minor)
  select p_period.id, pair.a, pair.b,
    coalesce(sum(pair.amount) filter (where pair.state = 'final'), 0)::bigint,
    coalesce(sum(pair.amount) filter (where pair.state = 'provisional'), 0)::bigint,
    coalesce(sum(pair.amount) filter (where pair.state = 'disputed'), 0)::bigint
  from (
    select
      least(e.debtor_id, e.creditor_id) as a,
      greatest(e.debtor_id, e.creditor_id) as b,
      (case when e.debtor_id < e.creditor_id then 1 else -1 end)
        * (case when e.kind in ('charge', 'adjustment') then 1 else -1 end)
        * e.amount_minor as amount,
      private.entry_state(e.kind, x.status, pm.status) as state
    from public.ledger_entries e
    left join public.expenses x on x.id = e.expense_id
    left join public.payments pm on pm.id = e.payment_id
    where e.apartment_id = p_period.apartment_id
  ) pair
  where pair.state is not null
  group by pair.a, pair.b
  having bool_or(pair.amount <> 0)
    and (coalesce(sum(pair.amount) filter (where pair.state = 'final'), 0) <> 0
      or coalesce(sum(pair.amount) filter (where pair.state = 'provisional'), 0) <> 0
      or coalesce(sum(pair.amount) filter (where pair.state = 'disputed'), 0) <> 0);

  update public.settlement_periods
  set state = 'closed',
      closed_at = now(),
      open_dispute_count =
        (select count(*) from public.disputes where apartment_id = p_period.apartment_id and state <> 'resolved')
        + (select count(*) from public.payment_disputes where apartment_id = p_period.apartment_id and state = 'open')
  where id = p_period.id;

  insert into public.settlement_periods (apartment_id, starts_on, ends_on)
  values (p_period.apartment_id, next_start,
          private.next_settlement_date(next_start, apartment.settlement_day) - 1);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_period.apartment_id, null, 'settlement_period', p_period.id, 'closed',
          jsonb_build_object('starts_on', p_period.starts_on, 'ends_on', p_period.ends_on));
end;
$$;

-- Closes every period whose last day has passed in its apartment's timezone,
-- catching up periods a stopped job missed. Safe to run twice or twice at
-- once: periods another run is closing are skipped. Returns how many it closed.
create function private.close_due_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  period public.settlement_periods;
  closed_count integer := 0;
begin
  loop
    select sp.* into period
    from public.settlement_periods sp
    join public.apartments a on a.id = sp.apartment_id
    where sp.state = 'open' and sp.ends_on < (now() at time zone a.timezone)::date
    order by sp.ends_on
    limit 1
    for update of sp skip locked;
    exit when period.id is null;
    perform private.close_period(period);
    closed_count := closed_count + 1;
  end loop;
  return closed_count;
end;
$$;

revoke execute on function private.ensure_open_period(uuid) from public;
revoke execute on function private.open_first_period() from public;
revoke execute on function private.close_period(public.settlement_periods) from public;
revoke execute on function private.close_due_periods() from public;

-- Every apartment that exists already gets its open period.
select private.ensure_open_period(id) from public.apartments;

-- Hourly, so each apartment closes soon after midnight in its own timezone.
select cron.schedule('close-settlement-periods', '5 * * * *', $$ select private.close_due_periods() $$);

-- Preview ---------------------------------------------------------------------------------

-- The open period, and for each person the caller has a balance with: what
-- the caller owes them and they owe the caller that is payable (final and
-- provisional), and what is held by disputes. The source obligations come
-- from get_my_pair_obligations.
create function private.settlement_preview(p_apartment_id uuid)
returns table (
  period_id uuid,
  starts_on date,
  ends_on date,
  counterparty_id uuid,
  owe_minor bigint,
  owed_minor bigint,
  held_owe_minor bigint,
  held_owed_minor bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  period public.settlement_periods;
begin
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;
  period := private.ensure_open_period(p_apartment_id);
  return query
  select period.id, period.starts_on, period.ends_on, b.counterparty_id,
    (b.owe_final_minor + b.owe_provisional_minor)::bigint,
    (b.owed_final_minor + b.owed_provisional_minor)::bigint,
    b.owe_disputed_minor,
    b.owed_disputed_minor
  from private.my_pair_balances(p_apartment_id) b
  where b.owe_final_minor + b.owe_provisional_minor <> 0
     or b.owed_final_minor + b.owed_provisional_minor <> 0
     or b.owe_disputed_minor <> 0
     or b.owed_disputed_minor <> 0;
end;
$$;

revoke execute on function private.settlement_preview(uuid) from public;
grant execute on function private.settlement_preview(uuid) to authenticated;

create function public.get_settlement_preview(p_apartment_id uuid)
returns table (
  period_id uuid,
  starts_on date,
  ends_on date,
  counterparty_id uuid,
  owe_minor bigint,
  owed_minor bigint,
  held_owe_minor bigint,
  held_owed_minor bigint
)
language sql
security invoker
set search_path = ''
as $$ select * from private.settlement_preview(p_apartment_id) $$;

revoke execute on function public.get_settlement_preview(uuid) from public, anon;
grant execute on function public.get_settlement_preview(uuid) to authenticated;
