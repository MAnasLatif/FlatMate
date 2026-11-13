-- Adjustments and locked periods (SRS FR-08.6, FR-05.6, FR-07.6, section 12
-- item 4, decision record 0006).
--
-- An adjustment is a final ledger entry that says the debtor owes the
-- creditor that much more. It corrects what a locked record cannot: the
-- person whose debt goes up records it, or an admin who is party to neither
-- side decides it. A final expense dated in a closed period is locked: it
-- cannot be edited or voided, and a late dispute accepted on it posts the
-- difference as adjustments instead of a new revision. Nothing can be posted
-- into, or moved into, a closed period.

create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  debtor_id uuid not null references public.profiles (id) on delete restrict,
  creditor_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  reason text not null,
  -- What the adjustment corrects, when there is one.
  expense_id uuid references public.expenses (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  dispute_id uuid references public.disputes (id) on delete restrict,
  payment_dispute_id uuid references public.payment_disputes (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint adjustments_two_people check (debtor_id <> creditor_id),
  constraint adjustments_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint adjustments_reason_valid check (char_length(reason) between 1 and 500 and reason = btrim(reason)),
  constraint adjustments_request_unique unique (apartment_id, client_request_id)
);

create index adjustments_pair on public.adjustments (apartment_id, debtor_id, creditor_id);
create index adjustments_creditor on public.adjustments (creditor_id);
create index adjustments_expense on public.adjustments (expense_id) where expense_id is not null;
create index adjustments_payment on public.adjustments (payment_id) where payment_id is not null;
create index adjustments_dispute on public.adjustments (dispute_id) where dispute_id is not null;
create index adjustments_payment_dispute on public.adjustments (payment_dispute_id) where payment_dispute_id is not null;
create index adjustments_created_by on public.adjustments (created_by);

create trigger adjustments_immutable before update or delete on public.adjustments
for each row execute function private.reject_change();

alter table public.adjustments enable row level security;
revoke all on table public.adjustments from anon, authenticated;
grant select on table public.adjustments to authenticated;

create policy "The two people and admins can read an adjustment"
on public.adjustments
for select
to authenticated
using (
  debtor_id = (select auth.uid())
  or creditor_id = (select auth.uid())
  or (select private.is_apartment_admin(apartment_id))
);

alter table public.ledger_entries add column adjustment_id uuid references public.adjustments (id) on delete restrict;
alter table public.ledger_entries drop constraint ledger_entries_kind_valid;
alter table public.ledger_entries add constraint ledger_entries_kind_valid
  check (kind in ('charge', 'charge_reversal', 'payment', 'offset', 'adjustment'));
alter table public.ledger_entries add constraint ledger_entries_adjustment_source
  check ((kind = 'adjustment') = (adjustment_id is not null));
create index ledger_entries_adjustment on public.ledger_entries (adjustment_id) where adjustment_id is not null;

alter table public.payment_disputes drop constraint payment_disputes_resolution_kind;
alter table public.payment_disputes add constraint payment_disputes_resolution_kind
  check (resolution is null or resolution in ('withdrawn', 'voided', 'adjusted'));
alter table public.payment_dispute_events drop constraint payment_dispute_events_action_valid;
alter table public.payment_dispute_events add constraint payment_dispute_events_action_valid
  check (action in ('raised', 'withdrawn', 'voided', 'adjusted'));

-- Locks -----------------------------------------------------------------------------------

-- Whether a date falls in a period of the apartment that has closed.
create function private.in_closed_period(p_apartment_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.settlement_periods
    where apartment_id = p_apartment_id and state = 'closed' and p_date between starts_on and ends_on
  );
$$;

-- A final expense dated in a closed period is locked (decision 0006).
create function private.is_locked(p_expense public.expenses)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_expense.status = 'final' and private.in_closed_period(p_expense.apartment_id, p_expense.expense_date);
$$;

revoke execute on function private.in_closed_period(uuid, date) from public;
revoke execute on function private.is_locked(public.expenses) from public;

-- Adjustments -----------------------------------------------------------------------------

-- Writes one adjustment and its ledger entry. Callers check who may.
create function private.write_adjustment(
  p_apartment_id uuid,
  p_debtor_id uuid,
  p_creditor_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_expense_id uuid,
  p_payment_id uuid,
  p_dispute_id uuid,
  p_payment_dispute_id uuid,
  p_actor uuid,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_adjustment uuid;
begin
  insert into public.adjustments (
    apartment_id, debtor_id, creditor_id, amount_minor, reason, expense_id, payment_id,
    dispute_id, payment_dispute_id, created_by, client_request_id
  )
  values (
    p_apartment_id, p_debtor_id, p_creditor_id, p_amount_minor, p_reason, p_expense_id, p_payment_id,
    p_dispute_id, p_payment_dispute_id, p_actor, p_client_request_id
  )
  returning id into new_adjustment;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, expense_id, adjustment_id)
  values (p_apartment_id, 'adjustment', p_debtor_id, p_creditor_id, p_amount_minor, p_expense_id, new_adjustment);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, p_actor, 'adjustment', new_adjustment, 'recorded');
  return new_adjustment;
end;
$$;

revoke execute on function private.write_adjustment(uuid, uuid, uuid, bigint, text, uuid, uuid, uuid, uuid, uuid, uuid) from public;

-- Records that p_debtor_id owes p_creditor_id p_amount_minor more. The person
-- whose debt goes up records it themselves, so a creditor who gives up an
-- amount records the reverse; otherwise an admin who is party to neither side
-- decides it. Given a late objection to a payment, it resolves that case. A
-- retried request with the same p_client_request_id returns the first one.
create function private.record_adjustment(
  p_apartment_id uuid,
  p_debtor_id uuid,
  p_creditor_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_expense_id uuid,
  p_payment_dispute_id uuid,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_user();
  reason text := btrim(p_reason);
  existing uuid;
  objection public.payment_disputes;
  payment_id uuid;
  new_adjustment uuid;
begin
  if not private.has_membership_history(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_client_request_id is not null then
    select id into existing from public.adjustments
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if not (
    actor = p_debtor_id
    or (actor <> p_creditor_id and private.is_apartment_admin(p_apartment_id))
  ) then
    raise exception 'not_allowed_to_adjust' using errcode = '42501';
  end if;
  if p_debtor_id = p_creditor_id then
    raise exception 'cannot_adjust_with_yourself' using errcode = '22023';
  end if;
  if (select count(*) from public.apartment_members
      where apartment_id = p_apartment_id and user_id in (p_debtor_id, p_creditor_id)) <> 2 then
    raise exception 'member_not_found' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if reason is null or reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (
    select 1 from public.expenses where id = p_expense_id and apartment_id = p_apartment_id
  ) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  if p_payment_dispute_id is not null then
    select * into objection from public.payment_disputes
    where id = p_payment_dispute_id and apartment_id = p_apartment_id for update;
    -- A late objection to a final payment is what an adjustment resolves (decision 0005).
    if objection.id is null or objection.state <> 'open' or not objection.is_late then
      raise exception 'dispute_not_open' using errcode = 'P0001';
    end if;
    select p.id into payment_id from public.payments p
    where p.id = objection.payment_id and p.payer_id = p_debtor_id and p.recipient_id = p_creditor_id;
    if payment_id is null then
      raise exception 'adjustment_does_not_match_payment' using errcode = '22023';
    end if;
  end if;

  perform private.lock_pair(p_apartment_id, p_debtor_id, p_creditor_id);
  new_adjustment := private.write_adjustment(
    p_apartment_id, p_debtor_id, p_creditor_id, p_amount_minor, reason, p_expense_id, payment_id,
    null, p_payment_dispute_id, actor, p_client_request_id
  );

  if objection.id is not null then
    update public.payment_disputes
    set state = 'resolved', resolution = 'adjusted', resolved_by = actor, resolved_at = now()
    where id = objection.id;
    insert into public.payment_dispute_events (dispute_id, actor_id, action, message)
    values (objection.id, actor, 'adjusted', reason);
  end if;
  return new_adjustment;
end;
$$;

revoke execute on function private.record_adjustment(uuid, uuid, uuid, bigint, text, uuid, uuid, uuid) from public;
grant execute on function private.record_adjustment(uuid, uuid, uuid, bigint, text, uuid, uuid, uuid) to authenticated;

create function public.record_adjustment(
  p_apartment_id uuid,
  p_debtor_id uuid,
  p_creditor_id uuid,
  p_amount_minor bigint,
  p_reason text,
  p_expense_id uuid default null,
  p_payment_dispute_id uuid default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_adjustment(
    p_apartment_id, p_debtor_id, p_creditor_id, p_amount_minor, p_reason, p_expense_id,
    p_payment_dispute_id, p_client_request_id
  )
$$;

revoke execute on function public.record_adjustment(uuid, uuid, uuid, bigint, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_adjustment(uuid, uuid, uuid, bigint, text, uuid, uuid, uuid) to authenticated;

-- Changed functions -----------------------------------------------------------------------
-- Each of these is its previous definition with only the noted change.


-- my_balances: adjustments count like charges.
CREATE OR REPLACE FUNCTION private.my_balances(p_apartment_id uuid)
 RETURNS TABLE(counterparty_id uuid, final_minor bigint, provisional_minor bigint, disputed_minor bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        * (case when e.kind in ('charge', 'adjustment') then 1 else -1 end)
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
$function$;

-- my_pair_balances: adjustments count like charges.
CREATE OR REPLACE FUNCTION private.my_pair_balances(p_apartment_id uuid)
 RETURNS TABLE(counterparty_id uuid, owe_final_minor bigint, owe_provisional_minor bigint, owe_disputed_minor bigint, owed_final_minor bigint, owed_provisional_minor bigint, owed_disputed_minor bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (case when e.kind in ('charge', 'adjustment') then 1 else -1 end) * e.amount_minor as signed_amount,
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
$function$;

-- my_pair_expenses: adjustments count like charges.
CREATE OR REPLACE FUNCTION private.my_pair_expenses(p_apartment_id uuid, p_counterparty_id uuid, p_limit integer, p_offset integer)
 RETURNS TABLE(expense_id uuid, title text, expense_date date, currency text, status text, paid_status text, owe_minor bigint, owed_minor bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := private.require_user();
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page' using errcode = '22023';
  end if;
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;

  return query
  select
    x.id,
    x.title,
    x.expense_date,
    x.currency,
    x.status,
    x.paid_status,
    coalesce(sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end)
      filter (where e.debtor_id = me), 0)::bigint,
    coalesce(sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end)
      filter (where e.debtor_id = p_counterparty_id), 0)::bigint
  from public.ledger_entries e
  join public.expenses x on x.id = e.expense_id
  where e.apartment_id = p_apartment_id
    and (
      (e.debtor_id = me and e.creditor_id = p_counterparty_id)
      or (e.debtor_id = p_counterparty_id and e.creditor_id = me)
    )
  group by x.id
  order by x.expense_date desc, x.created_at desc, x.id
  limit p_limit offset p_offset;
end;
$function$;

-- my_pair_obligations: adjustments count like charges.
CREATE OR REPLACE FUNCTION private.my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
 RETURNS TABLE(expense_id uuid, title text, expense_date date, direction text, amount_minor bigint, covered_minor bigint, is_held boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- pair_payable: adjustments count like charges.
CREATE OR REPLACE FUNCTION private.pair_payable(p_apartment_id uuid, p_debtor_id uuid, p_creditor_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end), 0)::bigint
  from public.ledger_entries e
  left join public.expenses x on x.id = e.expense_id
  left join public.payments p on p.id = e.payment_id
  where e.apartment_id = p_apartment_id
    and e.debtor_id = p_debtor_id
    and e.creditor_id = p_creditor_id
    and private.entry_state(e.kind, x.status, p.status) in ('provisional', 'final');
$function$;

-- post_expense: refuses a date in a closed period.
CREATE OR REPLACE FUNCTION private.post_expense(p_apartment_id uuid, p_title text, p_amount_minor bigint, p_expense_date date, p_split_method text, p_participants jsonb, p_payers jsonb, p_category_id uuid, p_description text, p_due_date date, p_client_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  author uuid := private.require_user();
  apartment public.apartments;
  existing uuid;
  new_expense uuid;
  is_paid boolean := coalesce(jsonb_array_length(p_payers), 0) > 0;
begin
  if not exists (
    select 1 from public.apartment_members
    where apartment_id = p_apartment_id and user_id = author and left_at is null and can_add_expense
  ) then
    raise exception 'not_allowed_to_add_expense' using errcode = '42501';
  end if;

  -- A retried request returns what the first one created.
  if p_client_request_id is not null then
    select id into existing from public.expenses
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  select * into apartment from public.apartments where id = p_apartment_id;
  if private.in_closed_period(p_apartment_id, p_expense_date) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.expense_categories
    where id = p_category_id and apartment_id = p_apartment_id and archived_at is null
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < p_expense_date then
    raise exception 'due_date_before_expense_date' using errcode = '22023';
  end if;

  -- Validates the split before anything is written.
  perform count(*) from private.compute_shares(p_amount_minor, p_split_method, p_participants);
  perform private.require_current_members(p_apartment_id, p_participants, 'participant_not_member');
  if is_paid then
    perform private.require_valid_payers(p_payers, p_amount_minor);
    perform private.require_current_members(p_apartment_id, p_payers, 'payer_not_member');
  end if;

  insert into public.expenses (
    apartment_id, title, description, category_id, amount_minor, currency, expense_date, due_date,
    paid_status, finalize_after, created_by, client_request_id
  )
  values (
    p_apartment_id, btrim(p_title), nullif(btrim(p_description), ''), p_category_id, p_amount_minor,
    apartment.currency, p_expense_date, p_due_date,
    case when is_paid then 'paid' else 'unpaid' end,
    now() + make_interval(days => apartment.approval_days),
    author, p_client_request_id
  )
  returning id into new_expense;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by)
  values (new_expense, 1, p_amount_minor, p_split_method, author);

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
  select new_expense, 1, share.user_id, share.amount_minor,
    case when p_split_method = 'percentage' then (
      select (p ->> 'basis_points')::integer from jsonb_array_elements(p_participants) p
      where (p ->> 'user_id')::uuid = share.user_id
    ) end
  from private.compute_shares(p_amount_minor, p_split_method, p_participants) share;

  if is_paid then
    insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
    select new_expense, 1, (payer ->> 'user_id')::uuid, (payer ->> 'amount_minor')::bigint
    from jsonb_array_elements(p_payers) payer;

    perform private.post_charges(new_expense, 1);
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_apartment_id, author, 'expense', new_expense, 'created',
    jsonb_build_object('amount_minor', p_amount_minor, 'paid', is_paid, 'revision', 1)
  );

  return new_expense;
end;
$function$;

-- edit_expense: refuses a locked expense and a date in a closed period.
CREATE OR REPLACE FUNCTION private.edit_expense(p_expense_id uuid, p_expected_revision integer, p_title text, p_category_id uuid, p_description text, p_expense_date date, p_due_date date, p_amount_minor bigint, p_split_method text, p_participants jsonb, p_payers jsonb, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  editor uuid := private.require_user();
  expense public.expenses;
  approval_days integer;
  current_method text;
  new_splits jsonb;
  current_splits jsonb;
  new_payers jsonb;
  current_payers jsonb;
  changes jsonb := '{}'::jsonb;
  money_changed boolean;
  next_revision integer;
  new_title text := btrim(p_title);
  new_description text := nullif(btrim(p_description), '');
  reason text := nullif(btrim(p_reason), '');
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  perform private.require_can_edit_expense(expense);
  if expense.status = 'void' then
    raise exception 'expense_void' using errcode = 'P0001';
  end if;
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
  perform private.require_no_open_dispute(expense.id);
  if private.is_locked(expense)
     or (p_expense_date is distinct from expense.expense_date
         and private.in_closed_period(expense.apartment_id, p_expense_date)) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;

  -- Descriptive fields.
  if p_category_id is distinct from expense.category_id and p_category_id is not null and not exists (
    select 1 from public.expense_categories
    where id = p_category_id and apartment_id = expense.apartment_id and archived_at is null
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < p_expense_date then
    raise exception 'due_date_before_expense_date' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  select changes
    || case when new_title is distinct from expense.title
         then jsonb_build_object('title', jsonb_build_object('from', expense.title, 'to', new_title)) else '{}' end
    || case when p_category_id is distinct from expense.category_id
         then jsonb_build_object('category_id', jsonb_build_object('from', expense.category_id, 'to', p_category_id)) else '{}' end
    || case when new_description is distinct from expense.description
         then jsonb_build_object('description', jsonb_build_object('from', expense.description, 'to', new_description)) else '{}' end
    || case when p_expense_date is distinct from expense.expense_date
         then jsonb_build_object('expense_date', jsonb_build_object('from', expense.expense_date, 'to', p_expense_date)) else '{}' end
    || case when p_due_date is distinct from expense.due_date
         then jsonb_build_object('due_date', jsonb_build_object('from', expense.due_date, 'to', p_due_date)) else '{}' end
  into changes;

  -- The money, compared with the current revision. compute_shares validates the split.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', share.user_id,
           'amount_minor', share.amount_minor,
           'basis_points', case when p_split_method = 'percentage' then (
             select (p ->> 'basis_points')::integer from jsonb_array_elements(p_participants) p
             where (p ->> 'user_id')::uuid = share.user_id
           ) end
         ) order by share.user_id), '[]'::jsonb)
  into new_splits
  from private.compute_shares(p_amount_minor, p_split_method, p_participants) share;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'amount_minor', s.amount_minor, 'basis_points', s.basis_points
         ) order by s.user_id), '[]'::jsonb)
  into current_splits
  from public.expense_splits s
  where s.expense_id = expense.id and s.revision = expense.revision;

  if expense.paid_status = 'paid' then
    perform private.require_valid_payers(coalesce(p_payers, '[]'::jsonb), p_amount_minor);
  elsif coalesce(jsonb_array_length(p_payers), 0) > 0 then
    raise exception 'unpaid_bill_has_no_payers' using errcode = '22023';
  end if;
  perform private.require_edit_parties(expense, p_participants, 'participant_not_member');
  perform private.require_edit_parties(expense, coalesce(p_payers, '[]'::jsonb), 'payer_not_member');

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', (payer ->> 'user_id')::uuid, 'amount_minor', (payer ->> 'amount_minor')::bigint
         ) order by (payer ->> 'user_id')::uuid), '[]'::jsonb)
  into new_payers
  from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) payer;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'amount_minor', p.amount_minor)
           order by p.user_id), '[]'::jsonb)
  into current_payers
  from public.expense_payers p
  where p.expense_id = expense.id and p.revision = expense.revision;

  select r.split_method into current_method
  from public.expense_revisions r
  where r.expense_id = expense.id and r.revision = expense.revision;

  money_changed := p_amount_minor <> expense.amount_minor
    or p_split_method <> current_method
    or new_splits <> current_splits
    or new_payers <> current_payers;

  if not money_changed and changes = '{}'::jsonb then
    return expense.revision;
  end if;
  if money_changed and p_expected_revision is distinct from expense.revision then
    raise exception 'expense_changed' using errcode = 'P0001';
  end if;

  update public.expenses
  set title = new_title,
      category_id = p_category_id,
      description = new_description,
      expense_date = p_expense_date,
      due_date = p_due_date
  where id = expense.id;

  next_revision := expense.revision;
  if money_changed then
    next_revision := expense.revision + 1;
    select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

    insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
    values (expense.id, next_revision, p_amount_minor, p_split_method, editor, reason);

    insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
    select expense.id, next_revision, (s ->> 'user_id')::uuid, (s ->> 'amount_minor')::bigint,
           (s ->> 'basis_points')::integer
    from jsonb_array_elements(new_splits) s;

    insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
    select expense.id, next_revision, (p ->> 'user_id')::uuid, (p ->> 'amount_minor')::bigint
    from jsonb_array_elements(new_payers) p;

    perform private.reverse_open_charges(expense.id);
    if expense.paid_status = 'paid' then
      perform private.post_charges(expense.id, next_revision);
    end if;

    update public.expenses
    set amount_minor = p_amount_minor,
        revision = next_revision,
        status = 'provisional',
        finalize_after = now() + make_interval(days => approval_days),
        finalized_at = null
    where id = expense.id;

    changes := changes
      || jsonb_build_object('revision', jsonb_build_object('from', expense.revision, 'to', next_revision))
      || case when p_amount_minor <> expense.amount_minor
           then jsonb_build_object('amount_minor', jsonb_build_object('from', expense.amount_minor, 'to', p_amount_minor))
           else '{}' end;
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    expense.apartment_id, editor, 'expense', expense.id, 'edited',
    jsonb_build_object('changes', changes, 'reason', reason)
  );

  return next_revision;
end;
$function$;

-- void_expense: refuses a locked expense.
CREATE OR REPLACE FUNCTION private.void_expense(p_expense_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  editor uuid := private.require_user();
  expense public.expenses;
  reason text := nullif(btrim(p_reason), '');
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  perform private.require_can_edit_expense(expense);
  if expense.status = 'void' then
    return;
  end if;
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
  perform private.require_no_open_dispute(expense.id);
  if private.is_locked(expense) then
    raise exception 'period_closed' using errcode = 'P0001';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  perform private.reverse_open_charges(expense.id);
  update public.expenses set status = 'void' where id = expense.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense.apartment_id, editor, 'expense', expense.id, 'voided', jsonb_build_object('reason', reason));
end;
$function$;

-- apply_dispute_adjustment: posts adjustments for a locked expense.
CREATE OR REPLACE FUNCTION private.apply_dispute_adjustment(p_dispute disputes, p_actor uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  expense public.expenses;
  new_split jsonb;
  next_revision integer;
  approval_days integer;
begin
  select * into expense from public.expenses where id = p_dispute.expense_id for update;
  -- Edits are refused while a dispute is open, so the revision cannot have moved.
  if expense.revision <> p_dispute.expense_revision then
    raise exception 'expense_changed' using errcode = 'P0001';
  end if;

  new_split := private.adjusted_split(expense, p_dispute.raised_by, p_dispute.proposed_share_minor);

  -- A locked expense keeps its revision: the difference between the debts it
  -- created and the debts the adjusted split would create is posted as
  -- adjustments, pair by pair.
  if private.is_locked(expense) then
    if expense.paid_status = 'paid' then
      perform private.write_adjustment(
        expense.apartment_id,
        case when diff.amount > 0 then diff.a else diff.b end,
        case when diff.amount > 0 then diff.b else diff.a end,
        abs(diff.amount), 'Dispute adjusted after the period closed', expense.id, null,
        p_dispute.id, null, p_actor, null
      )
      from (
        select d.a, d.b, sum(d.amount)::bigint as amount
        from (
          -- What each pair owes under the adjusted split, minus what it owes now. Positive: a owes b more.
          select least(m.debtor_id, m.creditor_id) as a, greatest(m.debtor_id, m.creditor_id) as b,
                 case when m.debtor_id < m.creditor_id then m.amount_minor else -m.amount_minor end as amount
          from private.match_debts(
            (select jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor))
             from public.expense_payers where expense_id = expense.id and revision = expense.revision),
            new_split) m
          union all
          select least(m.debtor_id, m.creditor_id), greatest(m.debtor_id, m.creditor_id),
                 case when m.debtor_id < m.creditor_id then -m.amount_minor else m.amount_minor end
          from private.match_debts(
            (select jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor))
             from public.expense_payers where expense_id = expense.id and revision = expense.revision),
            (select jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor))
             from public.expense_splits where expense_id = expense.id and revision = expense.revision)) m
        ) d
        group by d.a, d.b
        having sum(d.amount) <> 0
      ) diff;
    end if;
    return expense.revision;
  end if;
  next_revision := expense.revision + 1;
  select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
  values (expense.id, next_revision, expense.amount_minor, 'fixed', p_actor, 'dispute adjusted');

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor)
  select expense.id, next_revision, (s ->> 'user_id')::uuid, (s ->> 'amount_minor')::bigint
  from jsonb_array_elements(new_split) s;

  insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
  select expense.id, next_revision, p.user_id, p.amount_minor
  from public.expense_payers p
  where p.expense_id = expense.id and p.revision = expense.revision;

  perform private.reverse_open_charges(expense.id);
  if expense.paid_status = 'paid' then
    perform private.post_charges(expense.id, next_revision);
  end if;

  update public.expenses
  set revision = next_revision,
      status = 'provisional',
      finalize_after = now() + make_interval(days => approval_days),
      finalized_at = null
  where id = expense.id;

  return next_revision;
end;
$function$;
