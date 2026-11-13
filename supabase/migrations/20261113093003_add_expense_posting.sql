-- Posting expenses (SRS FR-03.1 to FR-03.4, FR-05.1, AC-02, AC-04).
--
-- One transaction per posting: the expense, its first revision, payers,
-- splits and the charges between members, plus a log entry. The database
-- computes every share and debt; the app's preview is never trusted.

-- Checks that every listed person is a current member of the apartment.
create function private.require_current_members(p_apartment_id uuid, p_people jsonb, p_error text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(p_people) person
    where not exists (
      select 1 from public.apartment_members m
      where m.apartment_id = p_apartment_id
        and m.user_id = (person ->> 'user_id')::uuid
        and m.left_at is null
    )
  ) then
    raise exception '%', p_error using errcode = '22023';
  end if;
end;
$$;

-- Validates payer contributions: positive whole amounts, nobody twice,
-- summing to the total.
create function private.require_valid_payers(p_payers jsonb, p_total bigint)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_payers) <> 'array' or jsonb_array_length(p_payers) = 0 then
    raise exception 'no_payers' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payers) payer
    where jsonb_typeof(payer -> 'amount_minor') <> 'number'
       or (payer -> 'amount_minor')::numeric <= 0
       or (payer -> 'amount_minor')::numeric <> trunc((payer -> 'amount_minor')::numeric)
  ) then
    raise exception 'invalid_payer_amount' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_payers))
     <> (select count(distinct (payer ->> 'user_id')::uuid) from jsonb_array_elements(p_payers) payer) then
    raise exception 'duplicate_payer' using errcode = '22023';
  end if;
  if (select sum((payer ->> 'amount_minor')::bigint) from jsonb_array_elements(p_payers) payer) <> p_total then
    raise exception 'payers_must_match_total' using errcode = '22023';
  end if;
end;
$$;

-- Writes the charges for one revision of an expense, from its payers and splits.
create function private.post_charges(p_expense_id uuid, p_revision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_apartment uuid;
begin
  select apartment_id into expense_apartment from public.expenses where id = p_expense_id;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, expense_id, expense_revision)
  select expense_apartment, 'charge', debt.debtor_id, debt.creditor_id, debt.amount_minor, p_expense_id, p_revision
  from private.match_debts(
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor)), '[]'::jsonb)
     from public.expense_payers where expense_id = p_expense_id and revision = p_revision),
    (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'amount_minor', amount_minor)), '[]'::jsonb)
     from public.expense_splits where expense_id = p_expense_id and revision = p_revision)
  ) debt
  where debt.amount_minor > 0;
end;
$$;

revoke execute on function private.require_current_members(uuid, jsonb, text) from public;
revoke execute on function private.require_valid_payers(jsonb, bigint) from public;
revoke execute on function private.post_charges(uuid, integer) from public;

-- Posting --------------------------------------------------------------------------------

-- p_participants: [{"user_id", "basis_points"?, "amount_minor"?}], see compute_shares.
-- p_payers: [{"user_id", "amount_minor"}], or [] for a bill that is not paid yet.
create function private.post_expense(
  p_apartment_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_expense_date date,
  p_split_method text,
  p_participants jsonb,
  p_payers jsonb,
  p_category_id uuid,
  p_description text,
  p_due_date date,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Records who paid a bill that was posted as unpaid. Its charges appear now,
-- and the objection window starts again from now.
create function private.record_bill_payment(p_expense_id uuid, p_payers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorder uuid := private.require_user();
  expense public.expenses;
  approval_days integer;
  next_revision integer;
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if expense.paid_status <> 'unpaid' or expense.status = 'void' then
    raise exception 'expense_not_unpaid' using errcode = 'P0001';
  end if;
  -- Paying would reset the status, which must not clear an open dispute.
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;

  perform private.require_valid_payers(p_payers, expense.amount_minor);
  perform private.require_current_members(expense.apartment_id, p_payers, 'payer_not_member');

  next_revision := expense.revision + 1;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
  select p_expense_id, next_revision, r.amount_minor, r.split_method, recorder, 'bill paid'
  from public.expense_revisions r
  where r.expense_id = p_expense_id and r.revision = expense.revision;

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
  select p_expense_id, next_revision, s.user_id, s.amount_minor, s.basis_points
  from public.expense_splits s
  where s.expense_id = p_expense_id and s.revision = expense.revision;

  insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
  select p_expense_id, next_revision, (payer ->> 'user_id')::uuid, (payer ->> 'amount_minor')::bigint
  from jsonb_array_elements(p_payers) payer;

  select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

  update public.expenses
  set paid_status = 'paid',
      revision = next_revision,
      status = 'provisional',
      finalize_after = now() + make_interval(days => approval_days)
  where id = p_expense_id;

  perform private.post_charges(p_expense_id, next_revision);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    expense.apartment_id, recorder, 'expense', p_expense_id, 'bill_paid',
    jsonb_build_object('payers', p_payers, 'revision', next_revision)
  );
end;
$$;

revoke execute on function private.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid)
from public;
revoke execute on function private.record_bill_payment(uuid, jsonb) from public;
grant execute on function private.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid)
to authenticated;
grant execute on function private.record_bill_payment(uuid, jsonb) to authenticated;

-- RPC endpoints -------------------------------------------------------------------------

create function public.post_expense(
  p_apartment_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_expense_date date,
  p_split_method text,
  p_participants jsonb,
  p_payers jsonb,
  p_category_id uuid default null,
  p_description text default null,
  p_due_date date default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.post_expense(
    p_apartment_id, p_title, p_amount_minor, p_expense_date, p_split_method, p_participants,
    p_payers, p_category_id, p_description, p_due_date, p_client_request_id
  );
$$;

create function public.record_bill_payment(p_expense_id uuid, p_payers jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.record_bill_payment(p_expense_id, p_payers) $$;

revoke execute on function public.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid)
from public, anon;
revoke execute on function public.record_bill_payment(uuid, jsonb) from public, anon;
grant execute on function public.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid)
to authenticated;
grant execute on function public.record_bill_payment(uuid, jsonb) to authenticated;
