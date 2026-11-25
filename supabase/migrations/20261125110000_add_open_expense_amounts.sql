-- What is still open on each expense, for the signed-in user (SRS FR-06.1,
-- FR-06.2, AC-09).
--
-- Expense rows showed the user's share of an expense even after a payment,
-- an offset or a simplification had covered it. Coverage is per pair, oldest
-- debt first, so it is worked out on the server, by the same rule as
-- get_my_pair_obligations:
--   private.my_obligations         every debt between the caller and each
--                                  other person, with how much is covered
--   private.my_pair_obligations    now that list for one person
--   get_my_open_expense_amounts    for some expenses, what is still open
--                                  with each person, each way

create function private.my_obligations(p_apartment_id uuid)
returns table (
  counterparty_id uuid,
  source text,
  source_id uuid,
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
  zone text;
begin
  if not private.has_membership_history(p_apartment_id) then
    return;
  end if;
  select a.timezone into zone from public.apartments a where a.id = p_apartment_id;

  return query
  with pair_entries as (
    select e.*,
      case when e.debtor_id = me then e.creditor_id else e.debtor_id end as other_id,
      case when e.debtor_id = me then 'owe' else 'owed' end as direction
    from public.ledger_entries e
    where e.apartment_id = p_apartment_id
      and (e.debtor_id = me or e.creditor_id = me)
  ),
  expense_items as (
    select
      e.other_id, 'expense'::text as source, x.id as source_id, x.id as expense_id, x.title,
      x.expense_date as dated, x.created_at, e.direction,
      sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end)::bigint as amount,
      x.status = 'disputed' as held
    from pair_entries e
    join public.expenses x on x.id = e.expense_id
    group by e.other_id, x.id, e.direction
    having sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end) > 0
  ),
  -- Adjustments not linked to an expense, by what made them.
  other_entries as (
    select
      e.other_id, e.direction, e.amount_minor, e.created_at, a.id as adjustment_id, a.reason,
      a.debt_transfer_id, da.deposit_id,
      case when a.debt_transfer_id is not null then 'simplification'
           when da.deposit_id is not null then 'deposit'
           else 'adjustment' end as source
    from pair_entries e
    join public.adjustments a on a.id = e.adjustment_id
    left join public.deposit_actions da on da.id = a.deposit_action_id
    where e.kind = 'adjustment' and e.expense_id is null
  ),
  other_items as (
    select
      o.other_id,
      o.source,
      coalesce(o.debt_transfer_id, o.deposit_id, o.adjustment_id) as source_id,
      null::uuid as expense_id,
      case o.source
        when 'simplification' then 'Debts simplified through ' || coalesce(min(mp.display_name), 'a flatmate')
        when 'deposit' then min(d.title)
        else min(o.reason)
      end as title,
      (min(o.created_at) at time zone zone)::date as dated,
      min(o.created_at) as created_at,
      o.direction,
      sum(o.amount_minor)::bigint as amount,
      false as held
    from other_entries o
    left join public.debt_transfers t on t.id = o.debt_transfer_id
    left join public.profiles mp on mp.id = t.middle_id
    left join public.deposits d on d.id = o.deposit_id
    group by o.other_id, o.source, coalesce(o.debt_transfer_id, o.deposit_id, o.adjustment_id), o.direction
  ),
  items as (
    select * from expense_items
    union all
    select * from other_items
  ),
  -- What has been settled with each person in each direction: payments that
  -- count, offsets and simplifications.
  settled as (
    select e.other_id, e.direction, sum(e.amount_minor)::bigint as total
    from pair_entries e
    left join public.payments p on p.id = e.payment_id
    where e.kind in ('offset', 'transfer') or (e.kind = 'payment' and p.status in ('provisional', 'final'))
    group by e.other_id, e.direction
  ),
  ordered as (
    select i.*,
      coalesce(sum(i.amount) filter (where not i.held) over (
        partition by i.other_id, i.direction order by i.dated, i.created_at, i.source_id
        rows between unbounded preceding and 1 preceding
      ), 0)::bigint as before
    from items i
  )
  select
    o.other_id, o.source, o.source_id, o.expense_id, o.title, o.dated, o.direction, o.amount,
    case when o.held then 0::bigint
         else least(o.amount, greatest(coalesce(s.total, 0) - o.before, 0))::bigint end,
    o.held
  from ordered o
  left join settled s on s.other_id = o.other_id and s.direction = o.direction
  order by o.other_id, o.direction, o.dated, o.created_at, o.source_id;
end;
$$;

revoke execute on function private.my_obligations(uuid) from public;
grant execute on function private.my_obligations(uuid) to authenticated;

-- Same result as before, from the shared rule.
create or replace function private.my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
returns table (
  source text,
  source_id uuid,
  expense_id uuid,
  title text,
  expense_date date,
  direction text,
  amount_minor bigint,
  covered_minor bigint,
  is_held boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.source, o.source_id, o.expense_id, o.title, o.expense_date, o.direction,
         o.amount_minor, o.covered_minor, o.is_held
  from private.my_obligations(p_apartment_id) o
  where o.counterparty_id = p_counterparty_id
  order by o.direction, o.expense_date, o.source_id
$$;

-- For the given expenses (a page of the feed or of a ledger), what the caller
-- still owes and is still owed on each, per person. Held amounts count as
-- open: nothing has settled them.
create function private.get_my_open_expense_amounts(p_apartment_id uuid, p_expense_ids uuid[])
returns table (expense_id uuid, counterparty_id uuid, owe_open_minor bigint, owed_open_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.expense_id, o.counterparty_id,
    coalesce(sum(o.amount_minor - o.covered_minor) filter (where o.direction = 'owe'), 0)::bigint,
    coalesce(sum(o.amount_minor - o.covered_minor) filter (where o.direction = 'owed'), 0)::bigint
  from private.my_obligations(p_apartment_id) o
  where o.source = 'expense' and o.expense_id = any (coalesce(p_expense_ids, '{}'))
  group by o.expense_id, o.counterparty_id
$$;

revoke execute on function private.get_my_open_expense_amounts(uuid, uuid[]) from public;
grant execute on function private.get_my_open_expense_amounts(uuid, uuid[]) to authenticated;

create function public.get_my_open_expense_amounts(p_apartment_id uuid, p_expense_ids uuid[])
returns table (expense_id uuid, counterparty_id uuid, owe_open_minor bigint, owed_open_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_my_open_expense_amounts(p_apartment_id, p_expense_ids) $$;

revoke execute on function public.get_my_open_expense_amounts(uuid, uuid[]) from public, anon;
grant execute on function public.get_my_open_expense_amounts(uuid, uuid[]) to authenticated;
