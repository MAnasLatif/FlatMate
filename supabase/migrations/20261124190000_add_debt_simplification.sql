-- Debt simplification (SRS FR-06.5; task 3.5, decision 30).
--
-- When Zubair owes Anas and Anas owes Yasir, Zubair can pay Yasir directly
-- instead: one transfer instead of two, and nobody's total changes. A
-- simplification is one such step among three people, for an amount no
-- more than either debt payable now (disputed amounts are never moved). Any
-- of the three proposes it, and it applies only once all three have
-- accepted, within 7 days and while the debts still cover it. Nobody is
-- given a new creditor or debtor without their yes.
--
-- Applying it writes new ledger entries and never changes old ones:
--   transfer    the debtor owes the middle person that much less
--   transfer    the middle person owes the creditor that much less
--   adjustment  the debtor owes the creditor that much more
-- Each person's net with the group stays the same, and the history shows
-- exactly which debts moved. The people in it see only the amount moved,
-- not each other's balances.

-- Records ----------------------------------------------------------------------------------

create table public.debt_transfers (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  -- Owes the middle person, and will owe the creditor instead.
  debtor_id uuid not null references public.profiles (id) on delete restrict,
  middle_id uuid not null references public.profiles (id) on delete restrict,
  creditor_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  -- proposed: waiting for all three. applied: in the ledger. declined: one
  -- of them said no. lapsed: 7 days passed, or the debts changed first.
  state text not null default 'proposed',
  proposed_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  closed_at timestamptz,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint debt_transfers_three_people check (
    debtor_id <> middle_id and middle_id <> creditor_id and debtor_id <> creditor_id
  ),
  constraint debt_transfers_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint debt_transfers_state_valid check (state in ('proposed', 'applied', 'declined', 'lapsed')),
  constraint debt_transfers_closed_valid check ((state = 'proposed') = (closed_at is null)),
  constraint debt_transfers_request_unique unique (apartment_id, client_request_id)
);

-- One open proposal per chain at a time.
create unique index debt_transfers_one_open
on public.debt_transfers (apartment_id, debtor_id, middle_id, creditor_id)
where state = 'proposed';
create index debt_transfers_debtor on public.debt_transfers (debtor_id);
create index debt_transfers_middle on public.debt_transfers (middle_id);
create index debt_transfers_creditor on public.debt_transfers (creditor_id);
create index debt_transfers_apartment on public.debt_transfers (apartment_id, created_at desc);

create table public.debt_transfer_answers (
  transfer_id uuid not null references public.debt_transfers (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  accepted boolean not null,
  answered_at timestamptz not null default now(),
  primary key (transfer_id, user_id)
);

create index debt_transfer_answers_user on public.debt_transfer_answers (user_id);

-- Who reads a simplification: its three people and the apartment's admins,
-- as for the debts it moves.
create function private.can_read_debt_transfer(p_transfer public.debt_transfers)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) in (p_transfer.debtor_id, p_transfer.middle_id, p_transfer.creditor_id)
    or private.is_apartment_admin(p_transfer.apartment_id)
$$;

revoke execute on function private.can_read_debt_transfer(public.debt_transfers) from public;
grant execute on function private.can_read_debt_transfer(public.debt_transfers) to authenticated;

alter table public.debt_transfers enable row level security;
alter table public.debt_transfer_answers enable row level security;
revoke all on table public.debt_transfers, public.debt_transfer_answers from anon, authenticated;
grant select on table public.debt_transfers, public.debt_transfer_answers to authenticated;

create policy "Its three people and admins read a simplification"
on public.debt_transfers
for select
to authenticated
using (
  (select auth.uid()) in (debtor_id, middle_id, creditor_id)
  or (select private.is_apartment_admin(apartment_id))
);

create policy "Who can read a simplification reads its answers"
on public.debt_transfer_answers
for select
to authenticated
using (exists (select 1 from public.debt_transfers t where t.id = transfer_id));

-- The ledger --------------------------------------------------------------------------------

alter table public.ledger_entries
  add column debt_transfer_id uuid references public.debt_transfers (id) on delete restrict;
alter table public.ledger_entries drop constraint ledger_entries_kind_valid;
alter table public.ledger_entries add constraint ledger_entries_kind_valid
  check (kind in ('charge', 'charge_reversal', 'payment', 'offset', 'adjustment', 'transfer'));
alter table public.ledger_entries add constraint ledger_entries_transfer_source
  check ((kind = 'transfer') = (debt_transfer_id is not null));
create index ledger_entries_debt_transfer on public.ledger_entries (debt_transfer_id)
where debt_transfer_id is not null;

-- The new debt a simplification creates is an adjustment linked to it.
alter table public.adjustments
  add column debt_transfer_id uuid references public.debt_transfers (id) on delete restrict;
create index adjustments_debt_transfer on public.adjustments (debt_transfer_id)
where debt_transfer_id is not null;

-- As in 20261113195846_add_adjustments_and_locks.sql: a simplification lowers
-- a debt like an offset, so it covers obligations oldest first too.
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
      sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end)::bigint as amount,
      x.status = 'disputed' as held
    from pair_entries e
    join public.expenses x on x.id = e.expense_id
    group by x.id, e.direction
    having sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end) > 0
  ),
  -- What has been settled in each direction: payments that count, offsets
  -- and simplifications.
  settled as (
    select e.direction, sum(e.amount_minor)::bigint as total
    from pair_entries e
    left join public.payments p on p.id = e.payment_id
    where e.kind in ('offset', 'transfer') or (e.kind = 'payment' and p.status in ('provisional', 'final'))
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

-- Suggestions ------------------------------------------------------------------------------

-- Steps that would cut the number of transfers, among current members: the
-- debtor owes the middle person, the middle person owes the creditor, and
-- either both debts are the same (two transfers become one) or the debtor
-- already owes the creditor (the moved amount joins that transfer). Only
-- steps the caller is part of, and none already proposed. Amounts are what
-- is payable now, so disputed amounts are never moved.
create function public.get_debt_transfer_suggestions(p_apartment_id uuid)
returns table (debtor_id uuid, middle_id uuid, creditor_id uuid, amount_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  return query
  with members as (
    select m.user_id from public.apartment_members m
    where m.apartment_id = p_apartment_id and m.left_at is null
  ),
  payable as (
    select d.user_id as debtor, c.user_id as creditor,
      private.pair_payable(p_apartment_id, d.user_id, c.user_id) as amount
    from members d cross join members c
    where d.user_id <> c.user_id
  ),
  owing as (select * from payable where amount > 0)
  select a.debtor, a.creditor, b.creditor, least(a.amount, b.amount)::bigint
  from owing a
  join owing b on b.debtor = a.creditor and b.creditor <> a.debtor
  where me in (a.debtor, a.creditor, b.creditor)
    and (a.amount = b.amount
         or exists (select 1 from owing c where c.debtor = a.debtor and c.creditor = b.creditor))
    and not exists (
      select 1 from public.debt_transfers t
      where t.apartment_id = p_apartment_id and t.state = 'proposed' and t.expires_at > now()
        and t.debtor_id = a.debtor and t.middle_id = a.creditor and t.creditor_id = b.creditor
    )
  order by least(a.amount, b.amount) desc, a.debtor, a.creditor, b.creditor
  limit 20;
end;
$$;

revoke execute on function public.get_debt_transfer_suggestions(uuid) from public, anon;
grant execute on function public.get_debt_transfer_suggestions(uuid) to authenticated;

-- Telling people ---------------------------------------------------------------------------

-- Records a step in a simplification's life and tells its other people.
create function private.announce_debt_transfer(
  p_transfer public.debt_transfers,
  p_action text,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id bigint;
  recipients uuid[];
begin
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_transfer.apartment_id, p_actor, 'debt_transfer', p_transfer.id, p_action,
    jsonb_build_object(
      'amount_minor', p_transfer.amount_minor, 'debtor_id', p_transfer.debtor_id,
      'middle_id', p_transfer.middle_id, 'creditor_id', p_transfer.creditor_id
    )
  )
  returning id into event_id;

  with inserted as (
    insert into public.notifications (user_id, apartment_id, audit_event_id, type, record_type, record_id, actor_id)
    select person, p_transfer.apartment_id, event_id, 'debt_transfer.' || p_action, 'debt_transfer',
      p_transfer.id, p_actor
    from unnest(array[p_transfer.debtor_id, p_transfer.middle_id, p_transfer.creditor_id]) person
    where person is distinct from p_actor
    on conflict do nothing
    returning user_id
  )
  select array_agg(user_id) into recipients from inserted;

  perform private.emit_change('user:' || person, 'notification')
  from unnest(coalesce(recipients, '{}')) person;
end;
$$;

revoke execute on function private.announce_debt_transfer(public.debt_transfers, text, uuid) from public;

-- Proposing and answering ------------------------------------------------------------------

-- Proposes moving p_amount_minor of what the debtor owes the middle person
-- to the creditor. The caller is one of the three and accepts it by
-- proposing. A retried request returns the first proposal.
create function private.propose_debt_transfer(
  p_apartment_id uuid,
  p_debtor_id uuid,
  p_middle_id uuid,
  p_creditor_id uuid,
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
  created public.debt_transfers;
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_client_request_id is not null then
    select id into existing from public.debt_transfers
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;
  if p_debtor_id is null or p_middle_id is null or p_creditor_id is null
     or p_debtor_id = p_middle_id or p_middle_id = p_creditor_id or p_debtor_id = p_creditor_id then
    raise exception 'transfer_needs_three_people' using errcode = '22023';
  end if;
  if me not in (p_debtor_id, p_middle_id, p_creditor_id) then
    raise exception 'not_in_transfer' using errcode = '42501';
  end if;
  if not (private.is_current_member_of(p_apartment_id, p_debtor_id)
          and private.is_current_member_of(p_apartment_id, p_middle_id)
          and private.is_current_member_of(p_apartment_id, p_creditor_id)) then
    raise exception 'transfer_member_left' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  perform private.lock_pair(p_apartment_id, p_debtor_id, p_middle_id);
  perform private.lock_pair(p_apartment_id, p_middle_id, p_creditor_id);
  if p_amount_minor > private.pair_payable(p_apartment_id, p_debtor_id, p_middle_id)
     or p_amount_minor > private.pair_payable(p_apartment_id, p_middle_id, p_creditor_id) then
    raise exception 'transfer_exceeds_debt' using errcode = '22023';
  end if;

  -- An older proposal for the same chain that ran out of time makes way.
  update public.debt_transfers
  set state = 'lapsed', closed_at = now()
  where apartment_id = p_apartment_id and state = 'proposed' and expires_at <= now()
    and debtor_id = p_debtor_id and middle_id = p_middle_id and creditor_id = p_creditor_id;
  if exists (
    select 1 from public.debt_transfers
    where apartment_id = p_apartment_id and state = 'proposed'
      and debtor_id = p_debtor_id and middle_id = p_middle_id and creditor_id = p_creditor_id
  ) then
    raise exception 'transfer_already_proposed' using errcode = '22023';
  end if;

  insert into public.debt_transfers (
    apartment_id, debtor_id, middle_id, creditor_id, amount_minor, proposed_by, expires_at, client_request_id
  )
  values (
    p_apartment_id, p_debtor_id, p_middle_id, p_creditor_id, p_amount_minor, me,
    now() + interval '7 days', p_client_request_id
  )
  returning * into created;

  insert into public.debt_transfer_answers (transfer_id, user_id, accepted) values (created.id, me, true);
  perform private.announce_debt_transfer(created, 'proposed', me);
  return created.id;
end;
$$;

revoke execute on function private.propose_debt_transfer(uuid, uuid, uuid, uuid, bigint, uuid) from public;
grant execute on function private.propose_debt_transfer(uuid, uuid, uuid, uuid, bigint, uuid) to authenticated;

-- Writes an accepted simplification into the ledger, if its debts still
-- cover it and its people are still members; otherwise it lapses. The
-- caller has locked the transfer. Returns the new state.
create function private.apply_debt_transfer(p_transfer public.debt_transfers, p_actor uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.debt_transfers := p_transfer;
  new_adjustment uuid;
begin
  perform private.lock_pair(t.apartment_id, t.debtor_id, t.middle_id);
  perform private.lock_pair(t.apartment_id, t.middle_id, t.creditor_id);
  perform private.lock_pair(t.apartment_id, t.debtor_id, t.creditor_id);

  if not (private.is_current_member_of(t.apartment_id, t.debtor_id)
          and private.is_current_member_of(t.apartment_id, t.middle_id)
          and private.is_current_member_of(t.apartment_id, t.creditor_id))
     or t.amount_minor > private.pair_payable(t.apartment_id, t.debtor_id, t.middle_id)
     or t.amount_minor > private.pair_payable(t.apartment_id, t.middle_id, t.creditor_id) then
    update public.debt_transfers set state = 'lapsed', closed_at = now() where id = t.id;
    perform private.announce_debt_transfer(t, 'lapsed', p_actor);
    return 'lapsed';
  end if;

  insert into public.adjustments (apartment_id, debtor_id, creditor_id, amount_minor, reason, created_by, debt_transfer_id)
  values (t.apartment_id, t.debtor_id, t.creditor_id, t.amount_minor,
          'Debts simplified: paid directly instead of through a flatmate.', t.proposed_by, t.id)
  returning id into new_adjustment;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, debt_transfer_id, adjustment_id)
  values
    (t.apartment_id, 'transfer', t.debtor_id, t.middle_id, t.amount_minor, t.id, null),
    (t.apartment_id, 'transfer', t.middle_id, t.creditor_id, t.amount_minor, t.id, null),
    (t.apartment_id, 'adjustment', t.debtor_id, t.creditor_id, t.amount_minor, null, new_adjustment);

  update public.debt_transfers set state = 'applied', closed_at = now() where id = t.id;
  perform private.announce_debt_transfer(t, 'applied', p_actor);
  return 'applied';
end;
$$;

revoke execute on function private.apply_debt_transfer(public.debt_transfers, uuid) from public;

-- Accepts or declines a proposal the caller is part of. It applies once all
-- three have accepted; one no closes it. Returns its state afterwards, so a
-- repeated answer is harmless.
create function private.answer_debt_transfer(p_transfer_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  t public.debt_transfers;
begin
  select * into t from public.debt_transfers where id = p_transfer_id for update;
  if t.id is null or me not in (t.debtor_id, t.middle_id, t.creditor_id) then
    raise exception 'transfer_not_found' using errcode = 'P0002';
  end if;
  if p_accept is null then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;
  if t.state <> 'proposed' then
    return t.state;
  end if;
  if t.expires_at <= now() then
    update public.debt_transfers set state = 'lapsed', closed_at = now() where id = t.id;
    perform private.announce_debt_transfer(t, 'lapsed', null);
    return 'lapsed';
  end if;

  insert into public.debt_transfer_answers (transfer_id, user_id, accepted)
  values (t.id, me, p_accept)
  on conflict (transfer_id, user_id) do update set accepted = excluded.accepted, answered_at = now();

  if not p_accept then
    update public.debt_transfers set state = 'declined', closed_at = now() where id = t.id;
    perform private.announce_debt_transfer(t, 'declined', me);
    return 'declined';
  end if;

  if (select count(*) from public.debt_transfer_answers where transfer_id = t.id and accepted) = 3 then
    return private.apply_debt_transfer(t, me);
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (t.apartment_id, me, 'debt_transfer', t.id, 'accepted',
          jsonb_build_object('amount_minor', t.amount_minor, 'debtor_id', t.debtor_id,
                             'middle_id', t.middle_id, 'creditor_id', t.creditor_id));
  return 'proposed';
end;
$$;

revoke execute on function private.answer_debt_transfer(uuid, boolean) from public;
grant execute on function private.answer_debt_transfer(uuid, boolean) to authenticated;

create function public.propose_debt_transfer(
  p_apartment_id uuid,
  p_debtor_id uuid,
  p_middle_id uuid,
  p_creditor_id uuid,
  p_amount_minor bigint,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.propose_debt_transfer(
    p_apartment_id, p_debtor_id, p_middle_id, p_creditor_id, p_amount_minor, p_client_request_id
  )
$$;

revoke execute on function public.propose_debt_transfer(uuid, uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.propose_debt_transfer(uuid, uuid, uuid, uuid, bigint, uuid) to authenticated;

create function public.answer_debt_transfer(p_transfer_id uuid, p_accept boolean)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.answer_debt_transfer(p_transfer_id, p_accept) $$;

revoke execute on function public.answer_debt_transfer(uuid, boolean) from public, anon;
grant execute on function public.answer_debt_transfer(uuid, boolean) to authenticated;

-- Notifications ----------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_record_type_valid;
alter table public.notifications add constraint notifications_record_type_valid check (
  record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment',
                  'join_request', 'rejoin_invite', 'recurring', 'deposit', 'debt_transfer')
);

-- As in 20261124150000_add_security_deposits.sql, with simplifications among payments.
create or replace function private.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'expense.dispute\_%' then 'disputes'
    when p_type like 'expense.%' or p_type like 'recurring\_bill.%' then 'expenses'
    when p_type like 'payment.%' or p_type like 'offset.%' or p_type like 'adjustment.%'
      or p_type like 'deposit.%' or p_type like 'debt\_transfer.%' then 'payments'
    when p_type like 'member.%' or p_type like 'join\_request.%' or p_type like 'rejoin\_invite.%' then 'members'
    when p_type like 'reminder.%' then 'reminders'
    when p_type like 'settlement\_period.%' then 'settlement'
    when p_type like 'budget.%' then 'budgets'
  end
$$;

-- As in 20261124150000_add_security_deposits.sql, with simplifications.
create or replace function private.push_text(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'expense.created' then 'An expense that includes you was added.'
    when 'expense.edited' then 'An expense that includes you was changed.'
    when 'expense.voided' then 'An expense that included you was cancelled.'
    when 'expense.bill_paid' then 'A bill that includes you was paid.'
    when 'expense.collector_set' then 'You were asked to pay a bill for your apartment.'
    when 'expense.dispute_raised' then 'An expense that includes you was disputed.'
    when 'expense.dispute_accepted' then 'A dispute on an expense that includes you was answered.'
    when 'expense.dispute_rejected' then 'A dispute on an expense that includes you was answered.'
    when 'expense.dispute_decided' then 'A dispute on an expense that includes you was decided.'
    when 'expense.dispute_withdrawn' then 'A dispute on an expense that includes you was withdrawn.'
    when 'payment.recorded' then 'A flatmate recorded a payment to you. Check that it arrived.'
    when 'payment.proof_added' then 'Proof was added to a payment to you.'
    when 'payment.declined' then 'A payment you recorded was declined.'
    when 'payment.decline_withdrawn' then 'An objection to your payment was withdrawn.'
    when 'payment.confirmed_by_app_policy' then 'Your payment is now final in FlatMate. Nobody objected in time.'
    when 'payment.voided' then 'A payment you are part of was voided.'
    when 'offset.netted_off' then 'Debts between you and a flatmate were netted off.'
    when 'adjustment.recorded' then 'An adjustment between you and a flatmate was recorded.'
    when 'member.joined' then 'Someone joined your apartment.'
    when 'member.left' then 'A member left your apartment.'
    when 'member.removed' then 'A member was removed from your apartment.'
    when 'member.you_were_removed' then 'You were removed from an apartment.'
    when 'member.role_changed' then 'Your role in an apartment changed.'
    when 'member.expense_permission_changed' then 'Your permission to add expenses changed.'
    when 'settlement_period.closed' then 'A settlement period closed. See the summary.'
    when 'join_request.requested' then 'Someone asked to join your apartment.'
    when 'join_request.approved' then 'Your request to join an apartment was approved.'
    when 'join_request.declined' then 'Your request to join an apartment was declined.'
    when 'rejoin_invite.sent' then 'You were invited back to an apartment.'
    when 'rejoin_invite.declined' then 'Someone declined your invitation to rejoin.'
    when 'recurring_bill.amount_needed' then 'A repeatable bill arrived. Enter its amount.'
    when 'recurring_bill.needs_review' then 'A repeatable expense needs its split checked.'
    when 'reminder.bill_due_soon' then 'A bill for your apartment is due soon and not paid yet.'
    when 'reminder.bill_due_today' then 'A bill for your apartment is due today and not paid yet.'
    when 'reminder.settlement_soon' then 'Settlement day is coming up. Check what you owe.'
    when 'budget.near_limit' then 'Your apartment has used 80% of a monthly budget.'
    when 'budget.over_limit' then 'Your apartment has reached a monthly budget.'
    when 'deposit.recorded' then 'A security deposit with your share was recorded.'
    when 'deposit.share_taken_over' then 'A security deposit share of yours changed hands.'
    when 'deposit.share_refunded' then 'Your security deposit share was refunded.'
    when 'deposit.returned' then 'A security deposit you share was returned.'
    when 'deposit.undone' then 'A change to a security deposit you share was undone.'
    when 'debt_transfer.proposed' then 'A flatmate suggested simplifying debts you are part of. Check it.'
    when 'debt_transfer.declined' then 'A suggestion to simplify debts was declined.'
    when 'debt_transfer.applied' then 'Debts you are part of were simplified.'
    when 'debt_transfer.lapsed' then 'A suggestion to simplify debts lapsed.'
    else 'Something changed in FlatMate.'
  end;
$$;

-- Activity ---------------------------------------------------------------------------------

-- An entry about a simplification shows to those who can read it: its three
-- people and the admins. Otherwise as in 20261124140000_add_activity_history.sql.
drop policy "Members read the history of what they can see" on public.audit_events;

create policy "Members read the history of what they can see"
on public.audit_events
for select
to authenticated
using (
  (select private.is_active_member(apartment_id))
  and case
    when entity_type = 'payment' then exists (select 1 from public.payments p where p.id = entity_id)
    when entity_type = 'offset' then exists (select 1 from public.offsets o where o.id = entity_id)
    when entity_type = 'adjustment' then exists (select 1 from public.adjustments a where a.id = entity_id)
    when entity_type = 'debt_transfer' then exists (select 1 from public.debt_transfers t where t.id = entity_id)
    when entity_type in ('invite', 'join_request', 'rejoin_invite', 'recurring_template', 'recurring_bill')
      then private.is_apartment_admin(apartment_id)
    else true
  end
);

-- As in 20261124160000_add_shared_inventory.sql, with simplifications among payments.
create or replace function private.activity_group(p_entity_type text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type = 'expense' and p_action like 'dispute\_%' then 'disputes'
    when p_entity_type in ('expense', 'inventory_item') then 'expenses'
    when p_entity_type in ('payment', 'offset', 'adjustment', 'settlement_period', 'deposit', 'debt_transfer')
      then 'payments'
    when p_entity_type in ('member', 'join_request', 'rejoin_invite', 'invite') then 'members'
    else 'settings'
  end
$$;

-- As in 20261124170000_add_rooms_and_occupancy.sql, with a simplification's
-- amount, debtor and creditor.
create or replace function public.get_activity(
  p_apartment_id uuid,
  p_group text default null,
  p_actor_id uuid default null,
  p_before bigint default null,
  p_limit integer default 30
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  details jsonb,
  subject text,
  amount_minor bigint,
  person_id uuid,
  counterparty_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_group is not null and p_group not in ('expenses', 'disputes', 'payments', 'members', 'settings') then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  return query
  select e.id, e.created_at, e.actor_id, e.entity_type, e.entity_id, e.action, e.details,
    case e.entity_type
      when 'expense' then x.title
      when 'expense_template' then t.title
      when 'recurring_template' then rt.title
      when 'recurring_bill' then rbt.title
      when 'category' then c.name
      when 'budget' then bc.name
      when 'deposit' then dp.title
      when 'inventory_item' then coalesce(ii.name, e.details ->> 'name')
      when 'room' then coalesce(rm.name, e.details ->> 'name')
    end,
    case e.entity_type
      when 'expense' then x.amount_minor
      when 'payment' then p.amount_minor
      when 'offset' then o.amount_minor
      when 'adjustment' then a.amount_minor
      when 'deposit' then (e.details ->> 'amount_minor')::bigint
      when 'debt_transfer' then (e.details ->> 'amount_minor')::bigint
    end,
    case e.entity_type
      when 'payment' then p.payer_id
      when 'offset' then o.initiator_id
      when 'adjustment' then a.debtor_id
      when 'member' then e.entity_id
      when 'join_request' then (e.details ->> 'user_id')::uuid
      when 'rejoin_invite' then (e.details ->> 'user_id')::uuid
      when 'deposit' then (e.details ->> 'user_id')::uuid
      when 'room' then (e.details ->> 'user_id')::uuid
      when 'debt_transfer' then (e.details ->> 'debtor_id')::uuid
    end,
    case e.entity_type
      when 'payment' then p.recipient_id
      when 'offset' then o.counterparty_id
      when 'adjustment' then a.creditor_id
      when 'deposit' then (e.details ->> 'counterparty_id')::uuid
      when 'debt_transfer' then (e.details ->> 'creditor_id')::uuid
    end
  from public.audit_events e
  left join public.expenses x on e.entity_type = 'expense' and x.id = e.entity_id
  left join public.expense_templates t on e.entity_type = 'expense_template' and t.id = e.entity_id
  left join public.recurring_templates rt on e.entity_type = 'recurring_template' and rt.id = e.entity_id
  left join public.recurring_instances ri on e.entity_type = 'recurring_bill' and ri.id = e.entity_id
  left join public.recurring_templates rbt on rbt.id = ri.template_id
  left join public.expense_categories c on e.entity_type = 'category' and c.id = e.entity_id
  left join public.expense_categories bc
    on e.entity_type = 'budget' and bc.id = (e.details ->> 'category_id')::uuid
  left join public.payments p on e.entity_type = 'payment' and p.id = e.entity_id
  left join public.offsets o on e.entity_type = 'offset' and o.id = e.entity_id
  left join public.adjustments a on e.entity_type = 'adjustment' and a.id = e.entity_id
  left join public.deposits dp on e.entity_type = 'deposit' and dp.id = e.entity_id
  left join public.inventory_items ii on e.entity_type = 'inventory_item' and ii.id = e.entity_id
  left join public.rooms rm on e.entity_type = 'room' and rm.id = e.entity_id
  where e.apartment_id = p_apartment_id
    and (p_before is null or e.id < p_before)
    and (p_actor_id is null or e.actor_id = p_actor_id)
    and (p_group is null or private.activity_group(e.entity_type, e.action) = p_group)
  order by e.id desc
  limit p_limit;
end;
$$;
