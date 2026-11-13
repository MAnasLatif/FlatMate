-- Balances and shared expenses between the signed-in user and each other
-- person (SRS FR-06.2, FR-06.3, decision record 0003).
--
-- Gross amounts in each direction come straight from the ledger entries
-- between the two, by state, so the members directory and the pairwise
-- ledger can show what the user owes, what they are owed and the net. Like
-- the other balance functions, these only ever report entries that involve
-- the caller, and nothing is stored.

-- For each person the caller has entries with: what the caller owes them
-- ("owe") and what they owe the caller ("owed"), by state.
create function private.my_pair_balances(p_apartment_id uuid)
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
      private.entry_state(e.kind, x.status) as state
    from public.ledger_entries e
    left join public.expenses x on x.id = e.expense_id
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
  group by counterparty
  order by counterparty;
end;
$$;

-- The expenses that create debts between the caller and one other person,
-- newest first, with what each makes the caller owe them ("owe") and them
-- owe the caller ("owed"). A voided or fully edited-away expense stays in
-- the list with zero, so the history between the two is complete.
create function private.my_pair_expenses(
  p_apartment_id uuid,
  p_counterparty_id uuid,
  p_limit integer,
  p_offset integer
)
returns table (
  expense_id uuid,
  title text,
  expense_date date,
  currency text,
  status text,
  paid_status text,
  owe_minor bigint,
  owed_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    coalesce(sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end)
      filter (where e.debtor_id = me), 0)::bigint,
    coalesce(sum(case when e.kind = 'charge' then e.amount_minor else -e.amount_minor end)
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
$$;

revoke execute on function private.my_pair_balances(uuid) from public;
revoke execute on function private.my_pair_expenses(uuid, uuid, integer, integer) from public;
grant execute on function private.my_pair_balances(uuid) to authenticated;
grant execute on function private.my_pair_expenses(uuid, uuid, integer, integer) to authenticated;

create function public.get_my_pair_balances(p_apartment_id uuid)
returns table (
  counterparty_id uuid,
  owe_final_minor bigint,
  owe_provisional_minor bigint,
  owe_disputed_minor bigint,
  owed_final_minor bigint,
  owed_provisional_minor bigint,
  owed_disputed_minor bigint
)
language sql
security invoker
set search_path = ''
as $$ select * from private.my_pair_balances(p_apartment_id) $$;

create function public.get_my_pair_expenses(
  p_apartment_id uuid,
  p_counterparty_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  expense_id uuid,
  title text,
  expense_date date,
  currency text,
  status text,
  paid_status text,
  owe_minor bigint,
  owed_minor bigint
)
language sql
security invoker
set search_path = ''
as $$ select * from private.my_pair_expenses(p_apartment_id, p_counterparty_id, p_limit, p_offset) $$;

revoke execute on function public.get_my_pair_balances(uuid) from public, anon;
revoke execute on function public.get_my_pair_expenses(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.get_my_pair_balances(uuid) to authenticated;
grant execute on function public.get_my_pair_expenses(uuid, uuid, integer, integer) to authenticated;
