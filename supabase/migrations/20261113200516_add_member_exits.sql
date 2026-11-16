-- Member exit (SRS FR-02.4, AC-11, decision record 0006).
--
-- When a member leaves or is removed, their balance with each person is
-- recorded as it stood, so the exit can be explained later. Leaving changes
-- nothing in the ledger: what they owe or are owed stays and can still be
-- paid. A former member keeps access only to their own obligations, plus the
-- receiving accounts of the people they still owe, so they can pay them.

create table public.member_exits (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null,
  exited_by uuid not null references public.profiles (id) on delete restrict,
  exited_at timestamptz not null default now(),
  constraint member_exits_reason_valid check (reason in ('left', 'removed'))
);

create index member_exits_apartment on public.member_exits (apartment_id);
create index member_exits_user on public.member_exits (user_id);
create index member_exits_exited_by on public.member_exits (exited_by);

-- What the member who left owed each person when they left, by state.
-- Positive: the member owed the counterparty.
create table public.member_exit_balances (
  exit_id uuid not null references public.member_exits (id) on delete cascade,
  counterparty_id uuid not null references public.profiles (id) on delete restrict,
  final_minor bigint not null,
  provisional_minor bigint not null,
  disputed_minor bigint not null,
  primary key (exit_id, counterparty_id)
);

create index member_exit_balances_counterparty on public.member_exit_balances (counterparty_id);

create trigger member_exits_immutable before update or delete on public.member_exits
for each row execute function private.reject_change();
create trigger member_exit_balances_immutable before update or delete on public.member_exit_balances
for each row execute function private.reject_change();

alter table public.member_exits enable row level security;
alter table public.member_exit_balances enable row level security;
revoke all on table public.member_exits, public.member_exit_balances from anon, authenticated;
grant select on table public.member_exits, public.member_exit_balances to authenticated;

create policy "Members, and the person who left, can read exits"
on public.member_exits
for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_active_member(apartment_id)));

-- Like payments, a balance between two people is theirs and the admins' to see.
create policy "The two people and admins can read an exit balance"
on public.member_exit_balances
for select
to authenticated
using (
  counterparty_id = (select auth.uid())
  or exists (
    select 1 from public.member_exits x
    where x.id = exit_id
      and (x.user_id = (select auth.uid()) or (select private.is_apartment_admin(x.apartment_id)))
  )
);

-- Records an exit and the member's balance with each person at that moment.
create function private.record_exit(p_apartment_id uuid, p_user_id uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exit uuid;
begin
  insert into public.member_exits (apartment_id, user_id, reason, exited_by)
  values (p_apartment_id, p_user_id, p_reason, p_actor)
  returning id into new_exit;

  insert into public.member_exit_balances (exit_id, counterparty_id, final_minor, provisional_minor, disputed_minor)
  select new_exit, e.counterparty,
    coalesce(sum(e.amount) filter (where e.state = 'final'), 0)::bigint,
    coalesce(sum(e.amount) filter (where e.state = 'provisional'), 0)::bigint,
    coalesce(sum(e.amount) filter (where e.state = 'disputed'), 0)::bigint
  from (
    select
      case when l.debtor_id = p_user_id then l.creditor_id else l.debtor_id end as counterparty,
      (case when l.debtor_id = p_user_id then 1 else -1 end)
        * (case when l.kind in ('charge', 'adjustment') then 1 else -1 end)
        * l.amount_minor as amount,
      private.entry_state(l.kind, x.status, pm.status) as state
    from public.ledger_entries l
    left join public.expenses x on x.id = l.expense_id
    left join public.payments pm on pm.id = l.payment_id
    where l.apartment_id = p_apartment_id and (l.debtor_id = p_user_id or l.creditor_id = p_user_id)
  ) e
  where e.state is not null
  group by e.counterparty
  having coalesce(sum(e.amount) filter (where e.state = 'final'), 0) <> 0
      or coalesce(sum(e.amount) filter (where e.state = 'provisional'), 0) <> 0
      or coalesce(sum(e.amount) filter (where e.state = 'disputed'), 0) <> 0;
end;
$$;

revoke execute on function private.record_exit(uuid, uuid, text, uuid) from public;

-- Changed functions -----------------------------------------------------------------------
-- Each is its previous definition with only the noted change.


-- leave_apartment: records the exit.
CREATE OR REPLACE FUNCTION private.leave_apartment(p_apartment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  leaver uuid := private.require_user();
  membership public.apartment_members := private.active_membership(p_apartment_id, leaver);
  others_remaining integer;
begin
  select count(*) into others_remaining
  from public.apartment_members
  where apartment_id = p_apartment_id and left_at is null and user_id <> leaver;

  -- The last admin hands over first, unless nobody else is left.
  if membership.role = 'admin'
     and others_remaining > 0
     and private.active_admin_count(p_apartment_id) = 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.apartment_members
  set left_at = now(), left_reason = 'left'
  where id = membership.id;

  perform private.record_exit(p_apartment_id, leaver, 'left', leaver);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, leaver, 'member', leaver, 'left');
end;
$function$;

-- remove_member: records the exit.
CREATE OR REPLACE FUNCTION private.remove_member(p_apartment_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  membership public.apartment_members := private.active_membership(p_apartment_id, p_user_id);
begin
  if p_user_id = admin_id then
    raise exception 'use_leave' using errcode = 'P0001';
  end if;

  update public.apartment_members
  set left_at = now(), left_reason = 'removed'
  where id = membership.id;

  perform private.record_exit(p_apartment_id, p_user_id, 'removed', admin_id);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, admin_id, 'member', p_user_id, 'removed');
end;
$function$;

-- shared_accounts: also serves a former member who still owes the owner.
CREATE OR REPLACE FUNCTION private.shared_accounts(p_apartment_id uuid, p_user_id uuid)
 RETURNS TABLE(id uuid, kind text, provider text, account_title text, account_identifier text, is_preferred boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- A former member only sees the accounts of people they still owe, so they can pay them.
  if not private.is_active_member(p_apartment_id)
     and not (private.has_membership_history(p_apartment_id)
              and private.pair_payable(p_apartment_id, (select auth.uid()), p_user_id) > 0) then
    return;
  end if;
  return query
  select a.id, a.kind, a.provider, a.account_title, a.account_identifier, a.is_preferred
  from public.receiving_account_shares s
  join public.receiving_accounts a on a.id = s.account_id
  where s.apartment_id = p_apartment_id
    and a.user_id = p_user_id
    and exists (
      select 1 from public.apartment_members m
      where m.apartment_id = p_apartment_id and m.user_id = p_user_id
    )
  order by a.is_preferred desc, a.created_at;
end;
$function$;
