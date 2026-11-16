-- Editing and voiding posted expenses (SRS FR-03.7, decision record 0003).
--
-- Descriptive fields (title, category, notes, dates) change the expense row
-- and are logged with their old and new values. A change to the money (the
-- amount, the split or who paid) writes a new revision instead: every charge
-- still in force is cancelled by a reversal linked to it, and the new
-- revision's charges are posted, in one transaction. The expense becomes
-- provisional again, so everyone in it can object to the new version.
-- Voiding cancels the charges the same way. Nothing is ever deleted.

-- The person who added the expense, or an admin, while they are a current member.
create function private.require_can_edit_expense(p_expense public.expenses)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.apartment_members m
    where m.apartment_id = p_expense.apartment_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and (m.role = 'admin' or m.user_id = p_expense.created_by)
  ) then
    raise exception 'not_allowed_to_edit_expense' using errcode = '42501';
  end if;
end;
$$;

-- Everyone listed must be a current member or already part of the expense's
-- current revision: a member who has left keeps their place in an edit, but
-- nobody outside the apartment can be added.
create function private.require_edit_parties(p_expense public.expenses, p_people jsonb, p_error text)
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
      where m.apartment_id = p_expense.apartment_id
        and m.user_id = (person ->> 'user_id')::uuid
        and m.left_at is null
    )
    and not exists (
      select 1 from public.expense_splits s
      where s.expense_id = p_expense.id and s.revision = p_expense.revision
        and s.user_id = (person ->> 'user_id')::uuid
    )
    and not exists (
      select 1 from public.expense_payers p
      where p.expense_id = p_expense.id and p.revision = p_expense.revision
        and p.user_id = (person ->> 'user_id')::uuid
    )
  ) then
    raise exception '%', p_error using errcode = '22023';
  end if;
end;
$$;

-- Cancels every charge of an expense that is still in force. Each reversal
-- points at the charge it cancels and carries that charge's revision.
create function private.reverse_open_charges(p_expense_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ledger_entries (
    apartment_id, kind, debtor_id, creditor_id, amount_minor, expense_id, expense_revision, reverses_entry_id
  )
  select c.apartment_id, 'charge_reversal', c.debtor_id, c.creditor_id, c.amount_minor,
         c.expense_id, c.expense_revision, c.id
  from public.ledger_entries c
  where c.expense_id = p_expense_id
    and c.kind = 'charge'
    and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = c.id);
$$;

revoke execute on function private.require_can_edit_expense(public.expenses) from public;
revoke execute on function private.require_edit_parties(public.expenses, jsonb, text) from public;
revoke execute on function private.reverse_open_charges(uuid) from public;

-- Editing --------------------------------------------------------------------------------

-- Applies an edit and returns the expense's revision afterwards. The arguments
-- describe the whole expense as it should be; unchanged values are left alone,
-- so repeating an edit that already succeeded changes nothing. A change to the
-- money must be based on the current revision (p_expected_revision), so an
-- edit made on a stale copy cannot silently undo someone else's.
--
-- p_participants and p_payers follow post_expense. An unpaid bill keeps no
-- payers; record_bill_payment records who paid it.
create function private.edit_expense(
  p_expense_id uuid,
  p_expected_revision integer,
  p_title text,
  p_category_id uuid,
  p_description text,
  p_expense_date date,
  p_due_date date,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_payers jsonb,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Voiding ---------------------------------------------------------------------------------

-- Cancels an expense: its charges are reversed and it no longer counts. It
-- stays visible with its history. Voiding a void expense changes nothing.
create function private.void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if reason is not null and char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  perform private.reverse_open_charges(expense.id);
  update public.expenses set status = 'void' where id = expense.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense.apartment_id, editor, 'expense', expense.id, 'voided', jsonb_build_object('reason', reason));
end;
$$;

revoke execute on function private.edit_expense(uuid, integer, text, uuid, text, date, date, bigint, text, jsonb, jsonb, text) from public;
revoke execute on function private.void_expense(uuid, text) from public;
grant execute on function private.edit_expense(uuid, integer, text, uuid, text, date, date, bigint, text, jsonb, jsonb, text) to authenticated;
grant execute on function private.void_expense(uuid, text) to authenticated;

create function public.edit_expense(
  p_expense_id uuid,
  p_expected_revision integer,
  p_title text,
  p_category_id uuid,
  p_description text,
  p_expense_date date,
  p_due_date date,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_payers jsonb,
  p_reason text default null
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.edit_expense(
    p_expense_id, p_expected_revision, p_title, p_category_id, p_description, p_expense_date,
    p_due_date, p_amount_minor, p_split_method, p_participants, p_payers, p_reason
  )
$$;

create function public.void_expense(p_expense_id uuid, p_reason text default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.void_expense(p_expense_id, p_reason) $$;

revoke execute on function public.edit_expense(uuid, integer, text, uuid, text, date, date, bigint, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.void_expense(uuid, text) from public, anon;
grant execute on function public.edit_expense(uuid, integer, text, uuid, text, date, date, bigint, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
