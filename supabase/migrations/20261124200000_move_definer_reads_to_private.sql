-- get_room_split and get_debt_transfer_suggestions ran with elevated rights directly from the
-- public schema. Like every other function, the work now lives in a private SECURITY DEFINER
-- function and the public one is a SECURITY INVOKER wrapper with the same signature, so
-- clients see no change. Checks and error keys are unchanged.

create function private.get_room_split(
  p_apartment_id uuid,
  p_amount_minor bigint,
  p_from date,
  p_to date
)
returns table (user_id uuid, amount_minor bigint, days integer, included boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return query select * from private.room_split(p_apartment_id, p_amount_minor, p_from, p_to);
end;
$$;

revoke execute on function private.get_room_split(uuid, bigint, date, date) from public;
grant execute on function private.get_room_split(uuid, bigint, date, date) to authenticated;

create or replace function public.get_room_split(
  p_apartment_id uuid,
  p_amount_minor bigint,
  p_from date,
  p_to date
)
returns table (user_id uuid, amount_minor bigint, days integer, included boolean)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_room_split(p_apartment_id, p_amount_minor, p_from, p_to) $$;

create function private.get_debt_transfer_suggestions(p_apartment_id uuid)
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

revoke execute on function private.get_debt_transfer_suggestions(uuid) from public;
grant execute on function private.get_debt_transfer_suggestions(uuid) to authenticated;

create or replace function public.get_debt_transfer_suggestions(p_apartment_id uuid)
returns table (debtor_id uuid, middle_id uuid, creditor_id uuid, amount_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_debt_transfer_suggestions(p_apartment_id) $$;
