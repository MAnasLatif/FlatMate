-- Balances (SRS FR-06.1, FR-06.2, decision record 0003).
--
-- Every balance is a sum of ledger entries, computed when asked. These
-- functions only ever answer for the signed-in user.

-- The state an entry counts under, from its source. Payments are added by
-- the payments migration.
create function private.entry_state(p_kind text, p_expense_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('charge', 'charge_reversal') then
      case p_expense_status when 'provisional' then 'provisional' when 'disputed' then 'disputed' else 'final' end
    else 'final'
  end
$$;

-- What the caller owes each other person in the apartment, by state. Positive
-- means the caller owes them; negative means they owe the caller. People with
-- nothing between them and the caller are left out.
create function private.my_balances(p_apartment_id uuid)
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
      private.entry_state(e.kind, x.status) as state
    from public.ledger_entries e
    left join public.expenses x on x.id = e.expense_id
    where e.apartment_id = p_apartment_id
      and (e.debtor_id = me or e.creditor_id = me)
  )
  select
    counterparty,
    coalesce(sum(signed_amount) filter (where state = 'final'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where state = 'provisional'), 0)::bigint,
    coalesce(sum(signed_amount) filter (where state = 'disputed'), 0)::bigint
  from entries
  group by counterparty
  having bool_or(signed_amount <> 0)
  order by counterparty;
end;
$$;

-- The caller's share of the apartment's expenses dated in the month of p_month.
create function private.my_monthly_share(p_apartment_id uuid, p_month date)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  month_start date := date_trunc('month', p_month)::date;
begin
  if not private.has_membership_history(p_apartment_id) then
    return 0;
  end if;

  return coalesce((
    select sum(s.amount_minor)
    from public.expenses x
    join public.expense_splits s on s.expense_id = x.id and s.revision = x.revision
    where x.apartment_id = p_apartment_id
      and x.status <> 'void'
      and s.user_id = me
      and x.expense_date >= month_start
      and x.expense_date < (month_start + interval '1 month')::date
  ), 0)::bigint;
end;
$$;

revoke execute on function private.entry_state(text, text) from public;
revoke execute on function private.my_balances(uuid) from public;
revoke execute on function private.my_monthly_share(uuid, date) from public;
grant execute on function private.my_balances(uuid) to authenticated;
grant execute on function private.my_monthly_share(uuid, date) to authenticated;

create function public.get_my_balances(p_apartment_id uuid)
returns table (counterparty_id uuid, final_minor bigint, provisional_minor bigint, disputed_minor bigint)
language sql
security invoker
set search_path = ''
as $$ select * from private.my_balances(p_apartment_id) $$;

create function public.get_my_monthly_share(p_apartment_id uuid, p_month date)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select private.my_monthly_share(p_apartment_id, p_month) $$;

revoke execute on function public.get_my_balances(uuid) from public, anon;
revoke execute on function public.get_my_monthly_share(uuid, date) from public, anon;
grant execute on function public.get_my_balances(uuid) to authenticated;
grant execute on function public.get_my_monthly_share(uuid, date) to authenticated;
