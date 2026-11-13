-- Netting off what two members owe each other (SRS FR-06.4, AC-09, decision
-- record 0003).
--
-- When two people owe each other, either can offset the smaller amount: a
-- pair of final 'offset' entries lowers what each owes the other by the same
-- amount, so the net between them never changes and nothing is paid twice.
-- Which obligations an offset covers is worked out oldest first, with
-- payments, by get_my_pair_obligations.

create table public.offsets (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  initiator_id uuid not null references public.profiles (id) on delete restrict,
  counterparty_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint offsets_two_people check (initiator_id <> counterparty_id),
  constraint offsets_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint offsets_request_unique unique (apartment_id, client_request_id)
);

create index offsets_pair on public.offsets (apartment_id, initiator_id, counterparty_id);
create index offsets_counterparty on public.offsets (counterparty_id);

create trigger offsets_immutable before update or delete on public.offsets
for each row execute function private.reject_change();

alter table public.offsets enable row level security;
revoke all on table public.offsets from anon, authenticated;
grant select on table public.offsets to authenticated;

create policy "The two people and admins can read an offset"
on public.offsets
for select
to authenticated
using (
  initiator_id = (select auth.uid())
  or counterparty_id = (select auth.uid())
  or (select private.is_apartment_admin(apartment_id))
);

alter table public.ledger_entries
  add constraint ledger_entries_offset_fk foreign key (offset_id) references public.offsets (id) on delete restrict;
create index ledger_entries_offset on public.ledger_entries (offset_id) where offset_id is not null;

-- Payments and offsets for one pair take the same locks, so neither can be
-- based on amounts the other is changing. Both directions are locked in a
-- fixed order to avoid deadlocks.
create function private.lock_pair(p_apartment_id uuid, p_first uuid, p_second uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_apartment_id::text || pair.debtor::text || pair.creditor::text, 0))
  from (values (p_first, p_second), (p_second, p_first)) as pair (debtor, creditor)
  order by pair.debtor, pair.creditor;
$$;

revoke execute on function private.lock_pair(uuid, uuid, uuid) from public;

-- Offsets up to p_amount_minor, or as much as possible when it is null:
-- never more than either person currently owes the other.
create function private.net_off(
  p_apartment_id uuid,
  p_counterparty_id uuid,
  p_amount_minor bigint,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  existing uuid;
  available bigint;
  amount bigint;
  new_offset uuid;
begin
  if not private.has_membership_history(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_client_request_id is not null then
    select id into existing from public.offsets
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;
  if p_counterparty_id = me then
    raise exception 'cannot_offset_with_yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.apartment_members where apartment_id = p_apartment_id and user_id = p_counterparty_id
  ) then
    raise exception 'counterparty_not_member' using errcode = '22023';
  end if;
  if p_amount_minor is not null and (p_amount_minor <= 0 or p_amount_minor > 1000000000000) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  perform private.lock_pair(p_apartment_id, me, p_counterparty_id);
  available := least(
    private.pair_payable(p_apartment_id, me, p_counterparty_id),
    private.pair_payable(p_apartment_id, p_counterparty_id, me)
  );
  if available <= 0 then
    raise exception 'nothing_to_offset' using errcode = '22023';
  end if;
  amount := coalesce(p_amount_minor, available);
  if amount > available then
    raise exception 'offset_exceeds_debt' using errcode = '22023';
  end if;

  insert into public.offsets (apartment_id, initiator_id, counterparty_id, amount_minor, client_request_id)
  values (p_apartment_id, me, p_counterparty_id, amount, p_client_request_id)
  returning id into new_offset;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, offset_id)
  values
    (p_apartment_id, 'offset', me, p_counterparty_id, amount, new_offset),
    (p_apartment_id, 'offset', p_counterparty_id, me, amount, new_offset);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, me, 'offset', new_offset, 'netted_off');

  return new_offset;
end;
$$;

revoke execute on function private.net_off(uuid, uuid, bigint, uuid) from public;
grant execute on function private.net_off(uuid, uuid, bigint, uuid) to authenticated;

create function public.net_off(
  p_apartment_id uuid,
  p_counterparty_id uuid,
  p_amount_minor bigint default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.net_off(p_apartment_id, p_counterparty_id, p_amount_minor, p_client_request_id) $$;

revoke execute on function public.net_off(uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.net_off(uuid, uuid, bigint, uuid) to authenticated;

-- Payments now take the pair's locks in both directions, like offsets. The
-- function is otherwise unchanged.
create or replace function private.record_payment(
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

  perform private.lock_pair(p_apartment_id, payer, p_recipient_id);
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

-- Obligations are now covered by offsets as well as payments, oldest first.
create or replace function private.my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
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
  with pair_entries as (
    select e.*, case when e.debtor_id = me then 'owe' else 'owed' end as direction
    from public.ledger_entries e
    where e.apartment_id = p_apartment_id
      and ((e.debtor_id = me and e.creditor_id = p_counterparty_id)
        or (e.debtor_id = p_counterparty_id and e.creditor_id = me))
  ),
  charges as (
    select
      x.id, x.title, x.expense_date, x.created_at, e.direction,
      sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end)::bigint as amount,
      x.status = 'disputed' as held
    from pair_entries e
    join public.expenses x on x.id = e.expense_id
    group by x.id, e.direction
    having sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end) > 0
  ),
  -- What has been settled in each direction: payments that count, and offsets.
  settled as (
    select e.direction, sum(e.amount_minor)::bigint as total
    from pair_entries e
    left join public.payments p on p.id = e.payment_id
    where e.kind = 'offset' or (e.kind = 'payment' and p.status in ('provisional', 'final'))
    group by e.direction
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
         else least(o.amount, greatest(coalesce(s.total, 0) - o.before, 0))::bigint end,
    o.held
  from ordered o
  left join settled s on s.direction = o.direction
  order by o.direction, o.expense_date, o.created_at, o.id;
end;
$$;
