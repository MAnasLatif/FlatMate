-- Statements and apartment reports (SRS FR-10.2, AC-14; task 2.7).
--
-- A statement covers one settlement period. What was carried forward into it
-- comes from the previous period's closing snapshot, and what it closed with
-- from its own snapshot, so a closed period's statement never changes. While
-- a period is open, its closing figures are the balances so far.
--
-- Both functions only read, and return JSON for the app, which lays it out
-- and makes the PDF on the phone. Amounts are integers in minor units. A pair
-- amount is signed from the reader's side: positive, they owe the other person.

-- What each pair owes now, by state, as close_period snapshots it. Positive:
-- member_a owes member_b.
create function private.pair_balances_now(p_apartment_id uuid)
returns table (member_a uuid, member_b uuid, final_minor bigint, provisional_minor bigint, disputed_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pair.a, pair.b,
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
    where e.apartment_id = p_apartment_id
  ) pair
  where pair.state is not null
  group by pair.a, pair.b;
$$;

revoke execute on function private.pair_balances_now(uuid) from public;

-- A period's opening and closing pair balances. Opening is the snapshot of
-- the period that ended the day before it began (none for the first period).
-- Closing is its own snapshot once closed, and the balances now while open.
create function private.period_pair_balances(p_period public.settlement_periods)
returns table (
  member_a uuid, member_b uuid,
  opening_minor bigint, opening_disputed_minor bigint,
  closing_minor bigint, closing_disputed_minor bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with opening as (
    select b.member_a, b.member_b, (b.final_minor + b.provisional_minor) as payable, b.disputed_minor as disputed
    from public.settlement_periods prev
    join public.settlement_balances b on b.period_id = prev.id
    where prev.apartment_id = p_period.apartment_id and prev.state = 'closed'
      and prev.ends_on = p_period.starts_on - 1
  ),
  closing as (
    select b.member_a, b.member_b, (b.final_minor + b.provisional_minor) as payable, b.disputed_minor as disputed
    from public.settlement_balances b
    where p_period.state = 'closed' and b.period_id = p_period.id
    union all
    select n.member_a, n.member_b, (n.final_minor + n.provisional_minor), n.disputed_minor
    from private.pair_balances_now(p_period.apartment_id) n
    where p_period.state = 'open'
  )
  select coalesce(o.member_a, c.member_a), coalesce(o.member_b, c.member_b),
    coalesce(o.payable, 0)::bigint, coalesce(o.disputed, 0)::bigint,
    coalesce(c.payable, 0)::bigint, coalesce(c.disputed, 0)::bigint
  from opening o
  full join closing c on c.member_a = o.member_a and c.member_b = o.member_b
  where coalesce(o.payable, 0) <> 0 or coalesce(o.disputed, 0) <> 0
     or coalesce(c.payable, 0) <> 0 or coalesce(c.disputed, 0) <> 0;
$$;

revoke execute on function private.period_pair_balances(public.settlement_periods) from public;

-- The caller's statement for one period of an apartment they belong or
-- belonged to:
--   period            id, starts_on, ends_on, state
--   expenses          those dated in the period that the caller shares in or
--                     paid for (cancelled ones left out): date, title,
--                     amount, status, their share, what they paid
--   payments          those dated in the period that the caller made or
--                     received (voided ones left out): date, direction,
--                     other person, amount, status
--   people            for each person the caller had a balance with, signed
--                     from the caller's side: carried forward, disputed
--                     carried forward, closing, disputed at close
create function private.my_statement(p_apartment_id uuid, p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  period public.settlement_periods;
  zone text;
begin
  if not private.has_membership_history(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  select * into period from public.settlement_periods
  where id = p_period_id and apartment_id = p_apartment_id;
  if period.id is null then
    raise exception 'period_not_found' using errcode = 'P0002';
  end if;
  select timezone into zone from public.apartments where id = p_apartment_id;

  return jsonb_build_object(
    'period', jsonb_build_object('id', period.id, 'starts_on', period.starts_on,
                                 'ends_on', period.ends_on, 'state', period.state),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
          'date', x.expense_date, 'title', x.title, 'amount_minor', x.amount_minor,
          'status', x.status, 'paid_status', x.paid_status,
          'share_minor', coalesce(s.amount_minor, 0), 'paid_minor', coalesce(p.amount_minor, 0))
        order by x.expense_date, x.created_at)
      from public.expenses x
      left join public.expense_splits s on s.expense_id = x.id and s.revision = x.revision and s.user_id = me
      left join public.expense_payers p on p.expense_id = x.id and p.revision = x.revision and p.user_id = me
      where x.apartment_id = p_apartment_id and x.status <> 'void'
        and x.expense_date between period.starts_on and period.ends_on
        and (s.user_id is not null or p.user_id is not null)
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
          'date', (pm.paid_at at time zone zone)::date,
          'direction', case when pm.payer_id = me then 'sent' else 'received' end,
          'person_id', case when pm.payer_id = me then pm.recipient_id else pm.payer_id end,
          'amount_minor', pm.amount_minor, 'status', pm.status)
        order by pm.paid_at)
      from public.payments pm
      where pm.apartment_id = p_apartment_id and pm.status <> 'void'
        and (pm.payer_id = me or pm.recipient_id = me)
        and (pm.paid_at at time zone zone)::date between period.starts_on and period.ends_on
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
          'person_id', case when b.member_a = me then b.member_b else b.member_a end,
          'opening_minor', case when b.member_a = me then b.opening_minor else -b.opening_minor end,
          'opening_disputed_minor', case when b.member_a = me then b.opening_disputed_minor else -b.opening_disputed_minor end,
          'closing_minor', case when b.member_a = me then b.closing_minor else -b.closing_minor end,
          'closing_disputed_minor', case when b.member_a = me then b.closing_disputed_minor else -b.closing_disputed_minor end))
      from private.period_pair_balances(period) b
      where b.member_a = me or b.member_b = me
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function private.my_statement(uuid, uuid) from public;
grant execute on function private.my_statement(uuid, uuid) to authenticated;

create function public.get_my_statement(p_apartment_id uuid, p_period_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.my_statement(p_apartment_id, p_period_id) $$;

revoke execute on function public.get_my_statement(uuid, uuid) from public, anon;
grant execute on function public.get_my_statement(uuid, uuid) to authenticated;

-- An admin's report for one period:
--   period            as in the statement
--   total_minor       spending dated in the period, cancelled expenses left out
--   open_disputes     disputes and payment objections open at close (or now)
--   members           for everyone with something in the period or a balance:
--                     their share and what they paid of the period's
--                     expenses, payments sent and received in it, and their
--                     net balance carried forward and at close (positive:
--                     they owe), and disputed at close
-- Members cannot run it: payments between others are private to them and
-- the admins (SRS section 12, item 8).
create function private.apartment_report(p_apartment_id uuid, p_period_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  period public.settlement_periods;
  zone text;
begin
  perform private.require_admin(p_apartment_id);
  select * into period from public.settlement_periods
  where id = p_period_id and apartment_id = p_apartment_id;
  if period.id is null then
    raise exception 'period_not_found' using errcode = 'P0002';
  end if;
  select timezone into zone from public.apartments where id = p_apartment_id;

  return jsonb_build_object(
    'period', jsonb_build_object('id', period.id, 'starts_on', period.starts_on,
                                 'ends_on', period.ends_on, 'state', period.state),
    'total_minor', (
      select coalesce(sum(x.amount_minor), 0) from public.expenses x
      where x.apartment_id = p_apartment_id and x.status <> 'void'
        and x.expense_date between period.starts_on and period.ends_on),
    'open_disputes', case when period.state = 'closed' then period.open_dispute_count else
        (select count(*) from public.disputes where apartment_id = p_apartment_id and state <> 'resolved')
        + (select count(*) from public.payment_disputes where apartment_id = p_apartment_id and state = 'open')
      end,
    'members', coalesce((
      with period_expenses as (
        select x.id, x.revision from public.expenses x
        where x.apartment_id = p_apartment_id and x.status <> 'void'
          and x.expense_date between period.starts_on and period.ends_on
      ),
      shares as (
        select s.user_id, sum(s.amount_minor) as amount from period_expenses x
        join public.expense_splits s on s.expense_id = x.id and s.revision = x.revision
        group by s.user_id
      ),
      paid as (
        select p.user_id, sum(p.amount_minor) as amount from period_expenses x
        join public.expense_payers p on p.expense_id = x.id and p.revision = x.revision
        group by p.user_id
      ),
      period_payments as (
        select pm.payer_id, pm.recipient_id, pm.amount_minor from public.payments pm
        where pm.apartment_id = p_apartment_id and pm.status <> 'void'
          and (pm.paid_at at time zone zone)::date between period.starts_on and period.ends_on
      ),
      sent as (select payer_id as user_id, sum(amount_minor) as amount from period_payments group by payer_id),
      received as (select recipient_id as user_id, sum(amount_minor) as amount from period_payments group by recipient_id),
      balances as (
        select person, sum(opening) as opening, sum(closing) as closing, sum(disputed) as disputed
        from (
          select b.member_a as person, b.opening_minor as opening, b.closing_minor as closing,
            b.closing_disputed_minor as disputed
          from private.period_pair_balances(period) b
          union all
          select b.member_b, -b.opening_minor, -b.closing_minor, -b.closing_disputed_minor
          from private.period_pair_balances(period) b
        ) sides
        group by person
      ),
      people as (
        select user_id from shares union select user_id from paid
        union select user_id from sent union select user_id from received
        union select person from balances
      )
      select jsonb_agg(jsonb_build_object(
          'person_id', pe.user_id,
          'share_minor', coalesce(sh.amount, 0), 'paid_minor', coalesce(pd.amount, 0),
          'sent_minor', coalesce(se.amount, 0), 'received_minor', coalesce(re.amount, 0),
          'opening_minor', coalesce(ba.opening, 0), 'closing_minor', coalesce(ba.closing, 0),
          'closing_disputed_minor', coalesce(ba.disputed, 0))
        order by pe.user_id)
      from people pe
      left join shares sh on sh.user_id = pe.user_id
      left join paid pd on pd.user_id = pe.user_id
      left join sent se on se.user_id = pe.user_id
      left join received re on re.user_id = pe.user_id
      left join balances ba on ba.person = pe.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function private.apartment_report(uuid, uuid) from public;
grant execute on function private.apartment_report(uuid, uuid) to authenticated;

create function public.get_apartment_report(p_apartment_id uuid, p_period_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.apartment_report(p_apartment_id, p_period_id) $$;

revoke execute on function public.get_apartment_report(uuid, uuid) from public, anon;
grant execute on function public.get_apartment_report(uuid, uuid) to authenticated;
