-- What "Other" is: a short label saved with an expense in a catch-all category,
-- such as "Gas cylinder" under Other. It needs a category, and the app offers
-- it for the category named Other. Categories themselves stay as admins set them.

alter table public.expenses
  add column category_detail text,
  add constraint expenses_category_detail_valid check (
    category_detail is null
    or (char_length(category_detail) between 1 and 60 and category_detail = btrim(category_detail))
  );

-- Adding an expense can include the label in the same call.
drop function public.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid);
drop function private.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid);

CREATE FUNCTION private.post_expense(p_apartment_id uuid, p_title text, p_amount_minor bigint, p_expense_date date, p_split_method text, p_participants jsonb, p_payers jsonb, p_category_id uuid, p_description text, p_due_date date, p_client_request_id uuid, p_collector_id uuid, p_category_detail text)
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
  detail text := nullif(btrim(p_category_detail), '');
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
  if detail is not null and p_category_id is null then
    raise exception 'category_detail_without_category' using errcode = '22023';
  end if;
  if detail is not null and char_length(detail) > 60 then
    raise exception 'category_detail_too_long' using errcode = '22023';
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
  -- Who will pay a bill that is not paid yet; a paid expense has no collector.
  if p_collector_id is not null then
    if is_paid then
      raise exception 'collector_for_paid_expense' using errcode = '22023';
    end if;
    if not private.is_current_member_of(p_apartment_id, p_collector_id) then
      raise exception 'collector_not_member' using errcode = '22023';
    end if;
  end if;

  insert into public.expenses (
    apartment_id, title, description, category_id, amount_minor, currency, expense_date, due_date,
    paid_status, finalize_after, created_by, client_request_id, collector_id, category_detail
  )
  values (
    p_apartment_id, btrim(p_title), nullif(btrim(p_description), ''), p_category_id, p_amount_minor,
    apartment.currency, p_expense_date, p_due_date,
    case when is_paid then 'paid' else 'unpaid' end,
    now() + make_interval(days => apartment.approval_days),
    author, p_client_request_id, p_collector_id, detail
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

  -- One statement, so the apartment gets one change event for both rows.
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  select p_apartment_id, author, 'expense', new_expense, row.action, row.details
  from (values
    ('created', jsonb_build_object('amount_minor', p_amount_minor, 'paid', is_paid, 'revision', 1), true),
    ('collector_set', jsonb_build_object('collector_id', p_collector_id), p_collector_id is not null)
  ) as row(action, details, wanted)
  where row.wanted;

  return new_expense;
end;
$function$;

revoke execute on function private.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid, text) from public;
grant execute on function private.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid, text) to authenticated;

-- The new argument defaults to null, so an app that does not send it keeps working.
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
  p_client_request_id uuid default null,
  p_collector_id uuid default null,
  p_category_detail text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.post_expense(
    p_apartment_id, p_title, p_amount_minor, p_expense_date, p_split_method, p_participants,
    p_payers, p_category_id, p_description, p_due_date, p_client_request_id, p_collector_id,
    p_category_detail
  );
$$;

revoke execute on function public.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid, text) from public, anon;
grant execute on function public.post_expense(uuid, text, bigint, date, text, jsonb, jsonb, uuid, text, date, uuid, uuid, text) to authenticated;

-- Changing the label later: the person who added the expense or an admin,
-- while the expense is not void. Null clears it.
create function private.set_expense_category_detail(p_expense_id uuid, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  expense public.expenses;
  detail text := nullif(btrim(p_detail), '');
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if expense.created_by <> me and not private.is_apartment_admin(expense.apartment_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if expense.status = 'void' then
    raise exception 'expense_void' using errcode = '22023';
  end if;
  if detail is not null and expense.category_id is null then
    raise exception 'category_detail_without_category' using errcode = '22023';
  end if;
  if detail is not null and char_length(detail) > 60 then
    raise exception 'category_detail_too_long' using errcode = '22023';
  end if;
  if expense.category_detail is not distinct from detail then
    return;
  end if;

  update public.expenses set category_detail = detail where id = expense.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense.apartment_id, me, 'expense', expense.id, 'edited',
          jsonb_build_object('changes', jsonb_build_object('category_detail',
            jsonb_build_object('from', expense.category_detail, 'to', detail))));
end;
$$;

revoke execute on function private.set_expense_category_detail(uuid, text) from public;
grant execute on function private.set_expense_category_detail(uuid, text) to authenticated;

create function public.set_expense_category_detail(p_expense_id uuid, p_detail text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_expense_category_detail(p_expense_id, p_detail) $$;

revoke execute on function public.set_expense_category_detail(uuid, text) from public, anon;
grant execute on function public.set_expense_category_detail(uuid, text) to authenticated;
