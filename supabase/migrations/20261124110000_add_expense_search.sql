-- Expense search, filters and monthly comparison (SRS FR-10.1; task 2.6).
--
-- search_expenses filters an apartment's expenses on the server, so a filter
-- finds expenses on pages the app has not loaded. It runs as the caller
-- (security invoker), so row-level security still decides what they see, and
-- it returns expense rows, so the app keeps embedding categories and its own
-- shares as it does for the plain list, and pages with range().
--
-- get_monthly_spending gives the apartment's total spending and the caller's
-- share for each of the last few months, in the apartment's timezone.

-- Filters left out (null) do not filter. p_member_id matches expenses the
-- member shares in or paid for, in the expense's current version. p_status is
-- an expense status, or 'unpaid' for a bill nobody has paid yet. p_query
-- matches the title, what an Other expense was, and the notes.
create function public.search_expenses(
  p_apartment_id uuid,
  p_from date,
  p_to date,
  p_member_id uuid default null,
  p_category_id uuid default null,
  p_status text default null,
  p_min_minor bigint default null,
  p_max_minor bigint default null,
  p_query text default null
)
returns setof public.expenses
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  pattern text;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('provisional', 'disputed', 'final', 'void', 'unpaid') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if (p_min_minor is not null and p_min_minor < 0)
     or (p_max_minor is not null and p_max_minor < 0)
     or (p_min_minor is not null and p_max_minor is not null and p_min_minor > p_max_minor) then
    raise exception 'invalid_amount_range' using errcode = '22023';
  end if;
  if p_query is not null and char_length(p_query) > 100 then
    raise exception 'query_too_long' using errcode = '22023';
  end if;

  -- The words typed are matched literally, wildcards included.
  pattern := nullif(btrim(coalesce(p_query, '')), '');
  if pattern is not null then
    pattern := '%' || replace(replace(replace(pattern, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select x.*
  from public.expenses x
  where x.apartment_id = p_apartment_id
    and x.expense_date >= p_from
    and x.expense_date < p_to
    and (p_category_id is null or x.category_id = p_category_id)
    and (p_status is null
         or (p_status = 'unpaid' and x.paid_status = 'unpaid' and x.status <> 'void')
         or (p_status <> 'unpaid' and x.status = p_status))
    and (p_min_minor is null or x.amount_minor >= p_min_minor)
    and (p_max_minor is null or x.amount_minor <= p_max_minor)
    and (pattern is null
         or x.title ilike pattern
         or x.category_detail ilike pattern
         or x.description ilike pattern)
    and (p_member_id is null
         or exists (
           select 1 from public.expense_splits s
           where s.expense_id = x.id and s.revision = x.revision and s.user_id = p_member_id)
         or exists (
           select 1 from public.expense_payers p
           where p.expense_id = x.id and p.revision = x.revision and p.user_id = p_member_id));
end;
$$;

revoke execute on function public.search_expenses(uuid, date, date, uuid, uuid, text, bigint, bigint, text)
from public, anon;
grant execute on function public.search_expenses(uuid, date, date, uuid, uuid, text, bigint, bigint, text)
to authenticated;

-- The apartment's spending and the caller's share, month by month, for the
-- p_months months up to and including the current one in the apartment's
-- timezone, oldest first. Cancelled expenses are left out; bills not paid yet
-- count, since they are costs of their month. Only current members see the
-- apartment's totals.
create function private.monthly_spending(p_apartment_id uuid, p_months integer)
returns table (month date, total_minor bigint, my_share_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  this_month date;
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_months is null or p_months not between 1 and 24 then
    raise exception 'invalid_months' using errcode = '22023';
  end if;

  select date_trunc('month', (now() at time zone a.timezone)::date)::date into this_month
  from public.apartments a where a.id = p_apartment_id;

  return query
  with months as (
    select (this_month - make_interval(months => n))::date as month
    from generate_series(0, p_months - 1) n
  )
  select m.month,
    coalesce((
      select sum(x.amount_minor) from public.expenses x
      where x.apartment_id = p_apartment_id and x.status <> 'void'
        and x.expense_date >= m.month and x.expense_date < (m.month + interval '1 month')::date
    ), 0)::bigint,
    coalesce((
      select sum(s.amount_minor) from public.expenses x
      join public.expense_splits s on s.expense_id = x.id and s.revision = x.revision
      where x.apartment_id = p_apartment_id and x.status <> 'void' and s.user_id = me
        and x.expense_date >= m.month and x.expense_date < (m.month + interval '1 month')::date
    ), 0)::bigint
  from months m
  order by m.month;
end;
$$;

revoke execute on function private.monthly_spending(uuid, integer) from public;
grant execute on function private.monthly_spending(uuid, integer) to authenticated;

create function public.get_monthly_spending(p_apartment_id uuid, p_months integer default 6)
returns table (month date, total_minor bigint, my_share_minor bigint)
language sql
security invoker
set search_path = ''
as $$ select * from private.monthly_spending(p_apartment_id, p_months) $$;

revoke execute on function public.get_monthly_spending(uuid, integer) from public, anon;
grant execute on function public.get_monthly_spending(uuid, integer) to authenticated;
