-- What two people owe each other, item by item, now includes the debts that do
-- not come from an expense (SRS FR-06.2, AC-09).
--
-- Until now get_my_pair_obligations listed only debts linked to an expense, so
-- a debt created by a simplification, a deposit action or a standalone
-- adjustment counted in the balance but appeared nowhere: "Settle with" could
-- say nothing was owed while the balance said otherwise. Each item now says
-- where it comes from:
--   source          expense | simplification | deposit | adjustment
--   source_id       the expense, the simplification, the deposit, or the
--                   adjustment itself
-- expense_id stays for the items that are expenses and is null for the rest.
-- A deposit's items are grouped per deposit and direction, the way an
-- expense's are; an undone deposit action shows in the other direction, as
-- what the ledger records. Payments, offsets and simplifications still settle
-- the oldest items first, now across all of them.
--
-- The return type changes, so both functions are dropped and created again.

drop function public.get_my_pair_obligations(uuid, uuid);
drop function private.my_pair_obligations(uuid, uuid);

create function private.my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
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
    select e.*, case when e.debtor_id = me then 'owe' else 'owed' end as direction
    from public.ledger_entries e
    where e.apartment_id = p_apartment_id
      and ((e.debtor_id = me and e.creditor_id = p_counterparty_id)
        or (e.debtor_id = p_counterparty_id and e.creditor_id = me))
  ),
  expense_items as (
    select
      'expense'::text as source, x.id as source_id, x.id as expense_id, x.title,
      x.expense_date as dated, x.created_at, e.direction,
      sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end)::bigint as amount,
      x.status = 'disputed' as held
    from pair_entries e
    join public.expenses x on x.id = e.expense_id
    group by x.id, e.direction
    having sum(case when e.kind in ('charge', 'adjustment') then e.amount_minor else -e.amount_minor end) > 0
  ),
  -- Adjustments not linked to an expense, by what made them.
  other_entries as (
    select
      e.direction, e.amount_minor, e.created_at, a.id as adjustment_id, a.reason,
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
    group by o.source, coalesce(o.debt_transfer_id, o.deposit_id, o.adjustment_id), o.direction
  ),
  items as (
    select * from expense_items
    union all
    select * from other_items
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
    select i.*,
      coalesce(sum(i.amount) filter (where not i.held) over (
        partition by i.direction order by i.dated, i.created_at, i.source_id
        rows between unbounded preceding and 1 preceding
      ), 0)::bigint as before
    from items i
  )
  select
    o.source, o.source_id, o.expense_id, o.title, o.dated, o.direction, o.amount,
    case when o.held then 0::bigint
         else least(o.amount, greatest(coalesce(s.total, 0) - o.before, 0))::bigint end,
    o.held
  from ordered o
  left join settled s on s.direction = o.direction
  order by o.direction, o.dated, o.created_at, o.source_id;
end;
$$;

revoke execute on function private.my_pair_obligations(uuid, uuid) from public;
grant execute on function private.my_pair_obligations(uuid, uuid) to authenticated;

create function public.get_my_pair_obligations(p_apartment_id uuid, p_counterparty_id uuid)
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
security invoker
set search_path = ''
as $$ select * from private.my_pair_obligations(p_apartment_id, p_counterparty_id) $$;

revoke execute on function public.get_my_pair_obligations(uuid, uuid) from public, anon;
grant execute on function public.get_my_pair_obligations(uuid, uuid) to authenticated;
