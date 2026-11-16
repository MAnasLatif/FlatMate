-- Recording payments (SRS FR-07.1, FR-07.3, FR-07.4, FR-07.7, AC-07, AC-09,
-- section 12 item 3, decision record 0003).
--
-- FlatMate never moves money. A member records that they paid another member
-- outside the app; the record is a claim, not proof of a transfer. It counts
-- as paid straight away, provisionally, and the recipient can object within
-- the apartment's window, which starts when the payment is recorded. A
-- payment reduces what the payer owes the recipient as a whole; which
-- expenses it covers is worked out oldest first when shown, never stored.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  payer_id uuid not null references public.profiles (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  currency text not null,
  -- When the payer says they paid, which can be before it was recorded.
  paid_at timestamptz not null,
  -- A transaction reference from the bank or wallet, as the payer typed it.
  reference text,
  status text not null default 'provisional',
  finalize_after timestamptz not null,
  finalized_at timestamptz,
  -- The expense the payment was started from, for context only.
  expense_id uuid references public.expenses (id) on delete restrict,
  -- Set by the app so that a retried request cannot record a second payment.
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint payments_two_people check (payer_id <> recipient_id),
  constraint payments_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint payments_reference_valid check (
    reference is null or (char_length(reference) between 1 and 100 and reference = btrim(reference))
  ),
  constraint payments_status_valid check (status in ('provisional', 'disputed', 'final', 'void')),
  constraint payments_request_unique unique (apartment_id, client_request_id)
);

create index payments_pair on public.payments (apartment_id, payer_id, recipient_id);
create index payments_recipient on public.payments (recipient_id);
create index payments_finalize_due on public.payments (finalize_after) where status = 'provisional';
create index payments_expense on public.payments (expense_id) where expense_id is not null;

-- The objection window closes at midnight in the apartment's timezone, as for expenses.
create trigger payments_window_closes_at_midnight
before insert or update of finalize_after on public.payments
for each row execute function private.close_window_at_local_midnight();

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;
grant select on table public.payments to authenticated;

-- A payment is between two people: they and the apartment's admins see it.
create policy "Payers, recipients and admins can read payments"
on public.payments
for select
to authenticated
using (
  payer_id = (select auth.uid())
  or recipient_id = (select auth.uid())
  or (select private.is_apartment_admin(apartment_id))
);

alter table public.ledger_entries
  add constraint ledger_entries_payment_fk foreign key (payment_id) references public.payments (id) on delete restrict;
create index ledger_entries_payment on public.ledger_entries (payment_id) where payment_id is not null;

-- Entry states -----------------------------------------------------------------------------

-- The state an entry counts under, from its source, or null when it does not
-- count at all. Expense entries follow the expense. A payment counts while it
-- is provisional or final; a disputed or void one is not counted as paid.
create function private.entry_state(p_kind text, p_expense_status text, p_payment_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('charge', 'charge_reversal') then
      case p_expense_status when 'provisional' then 'provisional' when 'disputed' then 'disputed' else 'final' end
    when p_kind = 'payment' then
      case p_payment_status when 'provisional' then 'provisional' when 'final' then 'final' else null end
    else 'final'
  end
$$;

revoke execute on function private.entry_state(text, text, text) from public;

create or replace function private.my_balances(p_apartment_id uuid)
returns table (counterparty_id uuid, final_minor bigint, provisional_minor bigint, disputed_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;

  return query
  with entries as (
    select
      case when e.debtor_id = me then e.creditor_id else e.debtor_id end as counterparty,
      (case when e.debtor_id = me then 1 else -1 end)
        * (case when e.kind = 'charge' then 1 else -1 end)
        * e.amount_minor as signed_amount,
      private.entry_state(e.kind, x.status, p.status) as state
    from public.ledger_entries e
    left join public.expenses x on x.id = e.expense_id
    left join public.payments p on p.id = e.payment_id
    where e.apartment_id = p_apartment_id
      and (e.debtor_id = me or e.creditor_id = me)
  )
  select
    counterparty,
    coalesce(sum(signed_amount) filter (where state = 'final'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where state = 'provisional'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where state = 'disputed'), 0)::bigint
  from entries
  where state is not null
  group by counterparty
  having bool_or(signed_amount <> 0)
  order by counterparty;
end;
$$;

create or replace function private.my_pair_balances(p_apartment_id uuid)
returns table (
  counterparty_id uuid,
  owe_final_minor bigint,
  owe_provisional_minor bigint,
  owe_disputed_minor bigint,
  owed_final_minor bigint,
  owed_provisional_minor bigint,
  owed_disputed_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;

  return query
  with entries as (
    select
      case when e.debtor_id = me then e.creditor_id else e.debtor_id end as counterparty,
      e.debtor_id = me as caller_owes,
      (case when e.kind = 'charge' then 1 else -1 end) * e.amount_minor as signed_amount,
      private.entry_state(e.kind, x.status, p.status) as state
    from public.ledger_entries e
    left join public.expenses x on x.id = e.expense_id
    left join public.payments p on p.id = e.payment_id
    where e.apartment_id = p_apartment_id
      and (e.debtor_id = me or e.creditor_id = me)
  )
  select
    counterparty,
    coalesce(sum(signed_amount) filter (where caller_owes and state = 'final'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where caller_owes and state = 'provisional'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where caller_owes and state = 'disputed'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where not caller_owes and state = 'final'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where not caller_owes and state = 'provisional'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where not caller_owes and state = 'disputed'), 0)::bigint
  from entries
  where state is not null
  group by counterparty
  order by counterparty;
end;
$$;

-- The two-argument version is replaced by the one above.
drop function private.entry_state(text, text);

-- What one person can pay another: their charges to them still in force and
-- not held by a dispute, less what they have already paid and has not been
-- objected to.
create function private.pair_payable(p_apartment_id uuid, p_debtor_id uuid, p_creditor_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end), 0)::bigint
  from public.ledger_entries e
  left join public.expenses x on x.id = e.expense_id
  left join public.payments p on p.id = e.payment_id
  where e.apartment_id = p_apartment_id
    and e.debtor_id = p_debtor_id
    and e.creditor_id = p_creditor_id
    and private.entry_state(e.kind, x.status, p.status) in ('provisional', 'final');
$$;

revoke execute on function private.pair_payable(uuid, uuid, uuid) from public;

-- Recording ---------------------------------------------------------------------------------

-- Records that the caller paid p_recipient_id. Partial amounts are fine, but
-- never more than the caller currently owes them. A retried request with the
-- same p_client_request_id returns the payment the first one recorded.
create function private.record_payment(
  p_apartment_id uuid,
  p_recipient_id uuid,
  p_amount_minor bigint,
  p_paid_at timestamptz,
  p_reference text,
  p_expense_id uuid,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payer uuid := private.require_user();
  apartment public.apartments;
  existing uuid;
  reference text := nullif(btrim(p_reference), '');
  paid_at timestamptz := coalesce(p_paid_at, now());
  payable bigint;
  new_payment uuid;
begin
  -- Former members can still pay what they owe (SRS FR-02.4).
  if not private.has_membership_history(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if p_client_request_id is not null then
    select id into existing from public.payments
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if p_recipient_id = payer then
    raise exception 'cannot_pay_yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.apartment_members where apartment_id = p_apartment_id and user_id = p_recipient_id
  ) then
    raise exception 'recipient_not_member' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if paid_at > now() + interval '5 minutes' then
    raise exception 'paid_at_in_future' using errcode = '22023';
  end if;
  if reference is not null and char_length(reference) > 100 then
    raise exception 'reference_too_long' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (
    select 1 from public.expenses where id = p_expense_id and apartment_id = p_apartment_id
  ) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  -- One payment at a time per pair, so two at once cannot together pay more than is owed.
  perform pg_advisory_xact_lock(hashtextextended(p_apartment_id::text || payer::text || p_recipient_id::text, 0));
  payable := private.pair_payable(p_apartment_id, payer, p_recipient_id);
  if p_amount_minor > payable then
    raise exception 'payment_exceeds_debt' using errcode = '22023';
  end if;

  select * into apartment from public.apartments where id = p_apartment_id;
  insert into public.payments (
    apartment_id, payer_id, recipient_id, amount_minor, currency, paid_at, reference,
    finalize_after, expense_id, client_request_id
  )
  values (
    p_apartment_id, payer, p_recipient_id, p_amount_minor, apartment.currency, paid_at, reference,
    now() + make_interval(days => apartment.approval_days), p_expense_id, p_client_request_id
  )
  returning id into new_payment;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, payment_id)
  values (p_apartment_id, 'payment', payer, p_recipient_id, p_amount_minor, new_payment);

  -- Who paid whom how much is private to the two of them, so the log only notes the record.
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, payer, 'payment', new_payment, 'recorded');

  return new_payment;
end;
$$;

revoke execute on function private.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid) from public;
grant execute on function private.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid) to authenticated;

create function public.record_payment(
  p_apartment_id uuid,
  p_recipient_id uuid,
  p_amount_minor bigint,
  p_paid_at timestamptz default null,
  p_reference text default null,
  p_expense_id uuid default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_payment(
    p_apartment_id, p_recipient_id, p_amount_minor, p_paid_at, p_reference, p_expense_id, p_client_request_id
  )
$$;

revoke execute on function public.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid) from public, anon;
grant execute on function public.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid) to authenticated;

-- Obligations -----------------------------------------------------------------------------

-- The expenses behind what the caller and one other person owe each other,
-- with how much of each is covered by payments: each direction's payments
-- that count are applied to its obligations oldest first. Obligations held by
-- a dispute are not payable, so payments never cover them. Nothing here is
-- stored, so a payment is never counted twice (AC-09).
create function private.my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
returns table (
  expense_id uuid,
  title text,
  expense_date date,
  direction text,
  amount_minor bigint,
  covered_minor bigint,
  is_held boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;

  return query
  with charges as (
    select
      x.id, x.title, x.expense_date, x.created_at,
      case when e.debtor_id = me then 'owe' else 'owed' end as direction,
      sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end)::bigint as amount,
      x.status = 'disputed' as held
    from public.ledger_entries e
    join public.expenses x on x.id = e.expense_id
    where e.apartment_id = p_apartment_id
      and ((e.debtor_id = me and e.creditor_id = p_counterparty_id)
        or (e.debtor_id = p_counterparty_id and e.creditor_id = me))
    group by x.id, case when e.debtor_id = me then 'owe' else 'owed' end
    having sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end) > 0
  ),
  paid as (
    select
      case when p.payer_id = me then 'owe' else 'owed' end as direction,
      sum(p.amount_minor)::bigint as total
    from public.payments p
    where p.apartment_id = p_apartment_id
      and p.status in ('provisional', 'final')
      and ((p.payer_id = me and p.recipient_id = p_counterparty_id)
        or (p.payer_id = p_counterparty_id and p.recipient_id = me))
    group by 1
  ),
  ordered as (
    select c.*,
      coalesce(sum(c.amount) filter (where not c.held) over (
        partition by c.direction order by c.expense_date, c.created_at, c.id
        rows between unbounded preceding and 1 preceding
      ), 0)::bigint as before
    from charges c
  )
  select
    o.id, o.title, o.expense_date, o.direction, o.amount,
    case when o.held then 0::bigint
         else least(o.amount, greatest(coalesce(pd.total, 0) - o.before, 0))::bigint end,
    o.held
  from ordered o
  left join paid pd on pd.direction = o.direction
  order by o.direction, o.expense_date, o.created_at, o.id;
end;
$$;

revoke execute on function private.my_pair_obligations(uuid, uuid) from public;
grant execute on function private.my_pair_obligations(uuid, uuid) to authenticated;

create function public.get_my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
returns table (
  expense_id uuid,
  title text,
  expense_date date,
  direction text,
  amount_minor bigint,
  covered_minor bigint,
  is_held boolean
)
language sql
security invoker
set search_path = ''
as $$ select * from private.my_pair_obligations(p_apartment_id, p_counterparty_id) $$;

revoke execute on function public.get_my_pair_obligations(uuid, uuid) from public, anon;
grant execute on function public.get_my_pair_obligations(uuid, uuid) to authenticated;
