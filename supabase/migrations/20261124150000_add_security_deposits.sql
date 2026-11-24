-- Security deposits (SRS FR-10.4; task 3.1, decision 25).
--
-- A deposit is paid to the landlord, who is not a member and so is never a
-- creditor (section 12, item 5). FlatMate records each member's share of it
-- and keeps balances right as shares move:
--
--   recorded     Who paid the landlord, and each member's share. A member who
--                paid more than their share is owed the difference, posted as
--                linked adjustments like the debts of an expense.
--   taken over   Another current member takes over all or part of a share and
--                owes its holder that amount.
--   refunded     The landlord refunds one member's share to them, less any
--                deductions. Nothing changes between members.
--   returned     The landlord returns the rest to one member, less deductions
--                shared by deposit share. That member owes each other holder
--                their part of the refund.
--   undone       The latest action is reversed with opposite entries and
--                adjustments. Nothing is edited or deleted.
--
-- A share is never stored as a number that changes: it is the sum of the
-- holder's entries. Only admins act, each action is one transaction, and a
-- retried request returns the first result.

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  title text not null,
  amount_minor bigint not null,
  paid_on date not null,
  -- Who holds it, such as the landlord or an agency; not a member.
  held_by text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint deposits_title_valid check (char_length(title) between 1 and 100 and title = btrim(title)),
  constraint deposits_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint deposits_held_by_valid check (
    held_by is null or (char_length(held_by) between 1 and 100 and held_by = btrim(held_by))
  )
);

create index deposits_apartment on public.deposits (apartment_id, paid_on desc);
create index deposits_created_by on public.deposits (created_by);

create table public.deposit_actions (
  id uuid primary key default gen_random_uuid(),
  -- The order actions happened in, which undoing follows.
  position bigint generated always as identity,
  deposit_id uuid not null references public.deposits (id) on delete restrict,
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  kind text not null,
  -- For an undo, the action it reverses.
  reverses_action_id uuid unique references public.deposit_actions (id) on delete restrict,
  -- Deductions taken with a refund or return: [{amount_minor, reason}].
  deductions jsonb not null default '[]',
  created_by uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint deposit_actions_kind_valid check (kind in ('recorded', 'taken_over', 'refunded', 'returned', 'undone')),
  constraint deposit_actions_undo_valid check ((kind = 'undone') = (reverses_action_id is not null)),
  constraint deposit_actions_request_unique unique (apartment_id, client_request_id)
);

create index deposit_actions_deposit on public.deposit_actions (deposit_id, position);
create index deposit_actions_created_by on public.deposit_actions (created_by);

-- One change to one person's share. amount_minor is signed: what it adds to
-- their share. A reversal repeats the kind with the opposite sign.
create table public.deposit_entries (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.deposit_actions (id) on delete restrict,
  deposit_id uuid not null references public.deposits (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null,
  amount_minor bigint not null,
  -- For a takeover, the other person; for a deduction, why it was kept.
  counterparty_id uuid references public.profiles (id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  constraint deposit_entries_kind_valid check (kind in ('share', 'transfer_in', 'transfer_out', 'refund', 'deduction')),
  constraint deposit_entries_amount_valid check (amount_minor <> 0 and abs(amount_minor) <= 1000000000000)
);

create index deposit_entries_deposit on public.deposit_entries (deposit_id, user_id);
create index deposit_entries_action on public.deposit_entries (action_id);
create index deposit_entries_user on public.deposit_entries (user_id);
create index deposit_entries_counterparty on public.deposit_entries (counterparty_id) where counterparty_id is not null;

create trigger deposits_immutable before update or delete on public.deposits
for each row execute function private.reject_change();
create trigger deposit_actions_immutable before update or delete on public.deposit_actions
for each row execute function private.reject_change();
create trigger deposit_entries_immutable before update or delete on public.deposit_entries
for each row execute function private.reject_change();

-- The debts a deposit action creates are adjustments linked to it.
alter table public.adjustments
  add column deposit_action_id uuid references public.deposit_actions (id) on delete restrict;
create index adjustments_deposit_action on public.adjustments (deposit_action_id) where deposit_action_id is not null;

-- Access -----------------------------------------------------------------------------------

-- Current members see the apartment's deposits and every share, as they see
-- every expense's split. Someone who has left still sees the deposits they
-- held a share of.
create function private.can_read_deposit(p_deposit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deposits d
    where d.id = p_deposit_id
      and (
        private.is_active_member(d.apartment_id)
        or exists (
          select 1 from public.deposit_entries e
          where e.deposit_id = d.id and e.user_id = (select auth.uid())
        )
      )
  )
$$;

revoke execute on function private.can_read_deposit(uuid) from public;
grant execute on function private.can_read_deposit(uuid) to authenticated;

alter table public.deposits enable row level security;
alter table public.deposit_actions enable row level security;
alter table public.deposit_entries enable row level security;
revoke all on table public.deposits, public.deposit_actions, public.deposit_entries from anon, authenticated;
grant select on table public.deposits, public.deposit_actions, public.deposit_entries to authenticated;

create policy "Members and holders read deposits" on public.deposits
for select to authenticated using ((select private.can_read_deposit(id)));
create policy "Members and holders read deposit actions" on public.deposit_actions
for select to authenticated using ((select private.can_read_deposit(deposit_id)));
create policy "Members and holders read deposit entries" on public.deposit_entries
for select to authenticated using ((select private.can_read_deposit(deposit_id)));

-- Arithmetic -------------------------------------------------------------------------------

-- Splits p_total in proportion to whole-number weights ([{user_id, weight}]),
-- with the rule compute_shares uses: each gets the floor of their part, and
-- leftover minor units go to the largest remainders, ties in user id order.
create function private.split_by_weights(p_total bigint, p_weights jsonb)
returns table (user_id uuid, amount_minor bigint)
language sql
immutable
set search_path = ''
as $$
  with ordered as (
    select (w ->> 'user_id')::uuid as participant, (w ->> 'weight')::bigint as weight,
      row_number() over (order by (w ->> 'user_id')::uuid) as position,
      (sum((w ->> 'weight')::bigint) over ())::bigint as total_weight
    from jsonb_array_elements(p_weights) w
  ),
  parts as (
    select participant, position,
      div(p_total * weight, total_weight)::bigint as base,
      mod(p_total * weight, total_weight)::bigint as remainder
    from ordered
  ),
  leftover as (select (p_total - sum(base))::bigint as units from parts),
  ranked as (select parts.*, row_number() over (order by remainder desc, position) as rank from parts)
  select ranked.participant, (ranked.base + case when ranked.rank <= leftover.units then 1 else 0 end)::bigint
  from ranked cross join leftover
  order by ranked.position
$$;

revoke execute on function private.split_by_weights(bigint, jsonb) from public;

-- What each person holds of a deposit now, for those who hold anything.
create function private.deposit_shares_now(p_deposit_id uuid)
returns table (user_id uuid, amount_minor bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, sum(e.amount_minor)::bigint
  from public.deposit_entries e
  where e.deposit_id = p_deposit_id
  group by e.user_id
  having sum(e.amount_minor) <> 0
  order by e.user_id
$$;

revoke execute on function private.deposit_shares_now(uuid) from public;

-- Checks deductions: a JSON array of {amount_minor, reason}, each positive with
-- a reason. Returns their total.
create function private.deductions_total(p_deductions jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  total bigint := 0;
  item jsonb;
begin
  if p_deductions is null or jsonb_typeof(p_deductions) <> 'array' then
    raise exception 'invalid_deductions' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_deductions) loop
    if jsonb_typeof(item -> 'amount_minor') <> 'number'
       or (item ->> 'amount_minor')::numeric <> trunc((item ->> 'amount_minor')::numeric)
       or (item ->> 'amount_minor')::numeric <= 0
       or (item ->> 'amount_minor')::numeric > 1000000000000
       or jsonb_typeof(item -> 'reason') <> 'string'
       or char_length(btrim(item ->> 'reason')) not between 1 and 200 then
      raise exception 'invalid_deductions' using errcode = '22023';
    end if;
    total := total + (item ->> 'amount_minor')::bigint;
  end loop;
  return total;
end;
$$;

revoke execute on function private.deductions_total(jsonb) from public;

-- Writing ----------------------------------------------------------------------------------

-- One adjustment and its ledger entry for a deposit action. The action's own
-- audit event records it, so there is no separate adjustment event.
create function private.write_deposit_adjustment(
  p_action public.deposit_actions,
  p_debtor_id uuid,
  p_creditor_id uuid,
  p_amount_minor bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_adjustment uuid;
begin
  insert into public.adjustments (
    apartment_id, debtor_id, creditor_id, amount_minor, reason, created_by, deposit_action_id
  )
  values (p_action.apartment_id, p_debtor_id, p_creditor_id, p_amount_minor, p_reason, p_action.created_by, p_action.id)
  returning id into new_adjustment;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, adjustment_id)
  values (p_action.apartment_id, 'adjustment', p_debtor_id, p_creditor_id, p_amount_minor, new_adjustment);
end;
$$;

revoke execute on function private.write_deposit_adjustment(public.deposit_actions, uuid, uuid, bigint, text) from public;

-- Records the action's audit event, and tells the people whose share or
-- balance it changed, other than whoever did it.
create function private.announce_deposit_action(p_action public.deposit_actions, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id bigint;
  recipients uuid[];
begin
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_action.apartment_id, p_action.created_by, 'deposit', p_action.deposit_id,
          case p_action.kind
            when 'recorded' then 'recorded'
            when 'taken_over' then 'share_taken_over'
            when 'refunded' then 'share_refunded'
            when 'returned' then 'returned'
            else 'undone'
          end,
          p_details || jsonb_build_object('action_id', p_action.id))
  returning id into event_id;

  with affected as (
    select e.user_id from public.deposit_entries e where e.action_id = p_action.id
    union
    select a.debtor_id from public.adjustments a where a.deposit_action_id = p_action.id
    union
    select a.creditor_id from public.adjustments a where a.deposit_action_id = p_action.id
  ),
  inserted as (
    insert into public.notifications (user_id, apartment_id, audit_event_id, type, record_type, record_id, actor_id)
    select f.user_id, p_action.apartment_id, event_id,
      'deposit.' || case p_action.kind
        when 'taken_over' then 'share_taken_over' when 'refunded' then 'share_refunded' else p_action.kind end,
      'deposit', p_action.deposit_id, p_action.created_by
    from affected f
    where f.user_id <> p_action.created_by
    on conflict do nothing
    returning user_id
  )
  select array_agg(user_id) into recipients from inserted;

  perform private.emit_change('user:' || person, 'notification')
  from unnest(coalesce(recipients, '{}')) person;
end;
$$;

revoke execute on function private.announce_deposit_action(public.deposit_actions, jsonb) from public;

-- Starts an action on a deposit: checks the caller is an admin of its
-- apartment and locks the deposit, so actions on it happen one at a time. A
-- retried request finds the action it already made.
create function private.begin_deposit_action(
  p_deposit_id uuid,
  p_kind text,
  p_client_request_id uuid,
  p_deductions jsonb default '[]',
  p_reverses uuid default null
)
returns table (action public.deposit_actions, is_retry boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  deposit public.deposits;
  admin_id uuid;
  existing public.deposit_actions;
  created public.deposit_actions;
begin
  select * into deposit from public.deposits where id = p_deposit_id for update;
  if deposit.id is null or not private.is_active_member(deposit.apartment_id) then
    raise exception 'deposit_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(deposit.apartment_id);

  if p_client_request_id is not null then
    select * into existing from public.deposit_actions
    where apartment_id = deposit.apartment_id and client_request_id = p_client_request_id;
    if existing.id is not null then
      return query select existing, true;
      return;
    end if;
  end if;

  insert into public.deposit_actions (deposit_id, apartment_id, kind, reverses_action_id, deductions, created_by, client_request_id)
  values (deposit.id, deposit.apartment_id, p_kind, p_reverses, coalesce(p_deductions, '[]'), admin_id, p_client_request_id)
  returning * into created;
  return query select created, false;
end;
$$;

revoke execute on function private.begin_deposit_action(uuid, text, uuid, jsonb, uuid) from public;

-- Records a deposit paid to the landlord: who paid it (as post_expense takes
-- payers) and each member's share (as post_expense takes a split). Returns
-- the deposit's id.
create function private.record_deposit(
  p_apartment_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_paid_on date,
  p_held_by text,
  p_payers jsonb,
  p_split_method text,
  p_participants jsonb,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  clean_title text := btrim(coalesce(p_title, ''));
  clean_held_by text := nullif(btrim(coalesce(p_held_by, '')), '');
  existing uuid;
  new_deposit uuid;
  action public.deposit_actions;
  shares jsonb;
  debt record;
begin
  if p_client_request_id is not null then
    select deposit_id into existing from public.deposit_actions
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if char_length(clean_title) not between 1 and 100 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if char_length(clean_held_by) > 100 then
    raise exception 'invalid_held_by' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > private.apartment_today(p_apartment_id) then
    raise exception 'invalid_paid_on' using errcode = '22023';
  end if;
  perform private.require_valid_payers(p_payers, p_amount_minor);
  perform private.require_current_members(p_apartment_id, p_payers, 'payer_not_member');
  perform private.require_current_members(p_apartment_id, p_participants, 'participant_not_member');
  select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'amount_minor', s.amount_minor))
  into shares
  from private.compute_shares(p_amount_minor, p_split_method, p_participants) s
  where s.amount_minor > 0;
  if shares is null then
    raise exception 'no_participants' using errcode = '22023';
  end if;

  insert into public.deposits (apartment_id, title, amount_minor, paid_on, held_by, created_by)
  values (p_apartment_id, clean_title, p_amount_minor, p_paid_on, clean_held_by, admin_id)
  returning id into new_deposit;

  insert into public.deposit_actions (deposit_id, apartment_id, kind, created_by, client_request_id)
  values (new_deposit, p_apartment_id, 'recorded', admin_id, p_client_request_id)
  returning * into action;

  insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor)
  select action.id, new_deposit, (s ->> 'user_id')::uuid, 'share', (s ->> 'amount_minor')::bigint
  from jsonb_array_elements(shares) s;

  for debt in select * from private.match_debts(p_payers, shares) loop
    perform private.write_deposit_adjustment(action, debt.debtor_id, debt.creditor_id, debt.amount_minor,
      'Deposit share: ' || clean_title);
  end loop;

  perform private.announce_deposit_action(action, jsonb_build_object('amount_minor', p_amount_minor));
  return new_deposit;
end;
$$;

revoke execute on function private.record_deposit(uuid, text, bigint, date, text, jsonb, text, jsonb, uuid) from public;
grant execute on function private.record_deposit(uuid, text, bigint, date, text, jsonb, text, jsonb, uuid) to authenticated;

-- A current member takes over p_amount_minor of p_from_id's share, and owes
-- them that much. Returns the action's id.
create function private.take_over_deposit_share(
  p_deposit_id uuid,
  p_from_id uuid,
  p_to_id uuid,
  p_amount_minor bigint,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  started record;
  action public.deposit_actions;
  title text;
  held bigint;
begin
  select * into started from private.begin_deposit_action(p_deposit_id, 'taken_over', p_client_request_id);
  action := started.action;
  if started.is_retry then
    return action.id;
  end if;

  select coalesce(amount_minor, 0) into held from private.deposit_shares_now(p_deposit_id) where user_id = p_from_id;
  if p_from_id is null or p_to_id is null or p_from_id = p_to_id then
    raise exception 'invalid_takeover' using errcode = '22023';
  end if;
  if not private.is_current_member_of(action.apartment_id, p_to_id) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > coalesce(held, 0) then
    raise exception 'more_than_share' using errcode = '22023';
  end if;

  insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor, counterparty_id) values
    (action.id, p_deposit_id, p_from_id, 'transfer_out', -p_amount_minor, p_to_id),
    (action.id, p_deposit_id, p_to_id, 'transfer_in', p_amount_minor, p_from_id);

  select d.title into title from public.deposits d where d.id = p_deposit_id;
  perform private.write_deposit_adjustment(action, p_to_id, p_from_id, p_amount_minor, 'Deposit share taken over: ' || title);

  perform private.announce_deposit_action(action, jsonb_build_object(
    'user_id', p_from_id, 'counterparty_id', p_to_id, 'amount_minor', p_amount_minor));
  return action.id;
end;
$$;

revoke execute on function private.take_over_deposit_share(uuid, uuid, uuid, bigint, uuid) from public;
grant execute on function private.take_over_deposit_share(uuid, uuid, uuid, bigint, uuid) to authenticated;

-- The landlord refunded p_user_id's whole share to them: p_refunded_minor
-- paid back and the deductions kept, which together are their share.
create function private.refund_deposit_share(
  p_deposit_id uuid,
  p_user_id uuid,
  p_refunded_minor bigint,
  p_deductions jsonb,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  deducted bigint := private.deductions_total(coalesce(p_deductions, '[]'));
  started record;
  action public.deposit_actions;
  held bigint;
begin
  select * into started from private.begin_deposit_action(p_deposit_id, 'refunded', p_client_request_id, p_deductions);
  action := started.action;
  if started.is_retry then
    return action.id;
  end if;

  select amount_minor into held from private.deposit_shares_now(p_deposit_id) where user_id = p_user_id;
  if held is null or held <= 0 then
    raise exception 'no_share' using errcode = '22023';
  end if;
  if p_refunded_minor is null or p_refunded_minor < 0 or p_refunded_minor + deducted <> held then
    raise exception 'refund_must_match_share' using errcode = '22023';
  end if;

  if p_refunded_minor > 0 then
    insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor)
    values (action.id, p_deposit_id, p_user_id, 'refund', -p_refunded_minor);
  end if;
  insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor, reason)
  select action.id, p_deposit_id, p_user_id, 'deduction', -(d ->> 'amount_minor')::bigint, btrim(d ->> 'reason')
  from jsonb_array_elements(coalesce(p_deductions, '[]')) d;

  perform private.announce_deposit_action(action, jsonb_build_object(
    'user_id', p_user_id, 'amount_minor', p_refunded_minor, 'deducted_minor', deducted));
  return action.id;
end;
$$;

revoke execute on function private.refund_deposit_share(uuid, uuid, bigint, jsonb, uuid) from public;
grant execute on function private.refund_deposit_share(uuid, uuid, bigint, jsonb, uuid) to authenticated;

-- The landlord returned what is left to p_received_by: p_refunded_minor paid
-- back and the deductions kept, which together are all the shares still
-- held. Each deduction is shared in proportion to the shares; each holder's
-- refund is their share less their deductions, and p_received_by owes it to
-- them. Every holder must still be a member: a share of someone who left is
-- refunded or taken over first.
create function private.return_deposit(
  p_deposit_id uuid,
  p_received_by uuid,
  p_refunded_minor bigint,
  p_deductions jsonb,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  deducted bigint := private.deductions_total(coalesce(p_deductions, '[]'));
  started record;
  action public.deposit_actions;
  title text;
  weights jsonb;
  held bigint;
  deduction jsonb;
  holder record;
begin
  select * into started from private.begin_deposit_action(p_deposit_id, 'returned', p_client_request_id, p_deductions);
  action := started.action;
  if started.is_retry then
    return action.id;
  end if;

  select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'weight', s.amount_minor)), sum(s.amount_minor)::bigint
  into weights, held
  from private.deposit_shares_now(p_deposit_id) s;
  if held is null or held <= 0 then
    raise exception 'no_share' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(weights) w
    where not private.is_current_member_of(action.apartment_id, (w ->> 'user_id')::uuid)
  ) then
    raise exception 'former_member_holds_share' using errcode = '22023';
  end if;
  if p_received_by is null or not private.is_current_member_of(action.apartment_id, p_received_by) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;
  if p_refunded_minor is null or p_refunded_minor < 0 or p_refunded_minor + deducted <> held then
    raise exception 'refund_must_match_share' using errcode = '22023';
  end if;

  for deduction in select * from jsonb_array_elements(coalesce(p_deductions, '[]')) loop
    insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor, reason)
    select action.id, p_deposit_id, part.user_id, 'deduction', -part.amount_minor, btrim(deduction ->> 'reason')
    from private.split_by_weights((deduction ->> 'amount_minor')::bigint, weights) part
    where part.amount_minor > 0;
  end loop;

  -- Each holder's refund is what is left of their share.
  insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor)
  select action.id, p_deposit_id, s.user_id, 'refund', -s.amount_minor
  from private.deposit_shares_now(p_deposit_id) s
  where s.amount_minor > 0;

  select d.title into title from public.deposits d where d.id = p_deposit_id;
  for holder in
    select e.user_id, -e.amount_minor as refund
    from public.deposit_entries e
    where e.action_id = action.id and e.kind = 'refund' and e.user_id <> p_received_by
  loop
    perform private.write_deposit_adjustment(action, p_received_by, holder.user_id, holder.refund,
      'Deposit refund: ' || title);
  end loop;

  perform private.announce_deposit_action(action, jsonb_build_object(
    'user_id', p_received_by, 'amount_minor', p_refunded_minor, 'deducted_minor', deducted));
  return action.id;
end;
$$;

revoke execute on function private.return_deposit(uuid, uuid, bigint, jsonb, uuid) from public;
grant execute on function private.return_deposit(uuid, uuid, bigint, jsonb, uuid) to authenticated;

-- Reverses the latest action on a deposit that is still in effect: its
-- entries with the opposite sign, and its adjustments the other way round.
-- Undoing the first action, the recording, cancels the deposit.
create function private.undo_deposit_action(p_action_id uuid, p_client_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.deposit_actions;
  started record;
  action public.deposit_actions;
  adjustment record;
begin
  select * into target from public.deposit_actions where id = p_action_id;
  if target.id is null or not private.is_active_member(target.apartment_id) then
    raise exception 'deposit_action_not_found' using errcode = 'P0002';
  end if;

  select * into started
  from private.begin_deposit_action(target.deposit_id, 'undone', p_client_request_id, '[]', target.id);
  action := started.action;
  if started.is_retry then
    return action.id;
  end if;

  -- The latest action still in effect: not an undo, and not undone.
  if target.kind = 'undone' or target.id is distinct from (
    select a.id from public.deposit_actions a
    where a.deposit_id = target.deposit_id and a.kind <> 'undone' and a.id <> action.id
      and not exists (select 1 from public.deposit_actions u where u.reverses_action_id = a.id and u.id <> action.id)
    order by a.position desc
    limit 1
  ) then
    raise exception 'not_latest_action' using errcode = '22023';
  end if;

  insert into public.deposit_entries (action_id, deposit_id, user_id, kind, amount_minor, counterparty_id, reason)
  select action.id, e.deposit_id, e.user_id, e.kind, -e.amount_minor, e.counterparty_id, e.reason
  from public.deposit_entries e
  where e.action_id = target.id;

  for adjustment in
    select a.debtor_id, a.creditor_id, a.amount_minor, a.reason
    from public.adjustments a where a.deposit_action_id = target.id
  loop
    perform private.write_deposit_adjustment(action, adjustment.creditor_id, adjustment.debtor_id,
      adjustment.amount_minor, left('Undone: ' || adjustment.reason, 500));
  end loop;

  perform private.announce_deposit_action(action, jsonb_build_object('undone', target.kind));
  return action.id;
end;
$$;

revoke execute on function private.undo_deposit_action(uuid, uuid) from public;
grant execute on function private.undo_deposit_action(uuid, uuid) to authenticated;

-- Public wrappers -------------------------------------------------------------------------

create function public.record_deposit(
  p_apartment_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_paid_on date,
  p_payers jsonb,
  p_split_method text,
  p_participants jsonb,
  p_held_by text default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_deposit(p_apartment_id, p_title, p_amount_minor, p_paid_on, p_held_by, p_payers,
    p_split_method, p_participants, p_client_request_id)
$$;

create function public.take_over_deposit_share(
  p_deposit_id uuid,
  p_from_id uuid,
  p_to_id uuid,
  p_amount_minor bigint,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.take_over_deposit_share(p_deposit_id, p_from_id, p_to_id, p_amount_minor, p_client_request_id) $$;

create function public.refund_deposit_share(
  p_deposit_id uuid,
  p_user_id uuid,
  p_refunded_minor bigint,
  p_deductions jsonb default '[]',
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.refund_deposit_share(p_deposit_id, p_user_id, p_refunded_minor, p_deductions, p_client_request_id) $$;

create function public.return_deposit(
  p_deposit_id uuid,
  p_received_by uuid,
  p_refunded_minor bigint,
  p_deductions jsonb default '[]',
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.return_deposit(p_deposit_id, p_received_by, p_refunded_minor, p_deductions, p_client_request_id) $$;

create function public.undo_deposit_action(p_action_id uuid, p_client_request_id uuid default null)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.undo_deposit_action(p_action_id, p_client_request_id) $$;

revoke execute on function public.record_deposit(uuid, text, bigint, date, jsonb, text, jsonb, text, uuid) from public, anon;
grant execute on function public.record_deposit(uuid, text, bigint, date, jsonb, text, jsonb, text, uuid) to authenticated;
revoke execute on function public.take_over_deposit_share(uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.take_over_deposit_share(uuid, uuid, uuid, bigint, uuid) to authenticated;
revoke execute on function public.refund_deposit_share(uuid, uuid, bigint, jsonb, uuid) from public, anon;
grant execute on function public.refund_deposit_share(uuid, uuid, bigint, jsonb, uuid) to authenticated;
revoke execute on function public.return_deposit(uuid, uuid, bigint, jsonb, uuid) from public, anon;
grant execute on function public.return_deposit(uuid, uuid, bigint, jsonb, uuid) to authenticated;
revoke execute on function public.undo_deposit_action(uuid, uuid) from public, anon;
grant execute on function public.undo_deposit_action(uuid, uuid) to authenticated;

-- Notifications and the timeline -----------------------------------------------------------

alter table public.notifications drop constraint notifications_record_type_valid;
alter table public.notifications add constraint notifications_record_type_valid check (
  record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment',
                  'join_request', 'rejoin_invite', 'recurring', 'deposit')
);

-- As in 20261124130000_add_quick_add_and_budgets.sql, with deposits among payments.
create or replace function private.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'expense.dispute\_%' then 'disputes'
    when p_type like 'expense.%' or p_type like 'recurring\_bill.%' then 'expenses'
    when p_type like 'payment.%' or p_type like 'offset.%' or p_type like 'adjustment.%'
      or p_type like 'deposit.%' then 'payments'
    when p_type like 'member.%' or p_type like 'join\_request.%' or p_type like 'rejoin\_invite.%' then 'members'
    when p_type like 'reminder.%' then 'reminders'
    when p_type like 'settlement\_period.%' then 'settlement'
    when p_type like 'budget.%' then 'budgets'
  end
$$;

-- As in 20261124130000_add_quick_add_and_budgets.sql, with deposits.
create or replace function private.push_text(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'expense.created' then 'An expense that includes you was added.'
    when 'expense.edited' then 'An expense that includes you was changed.'
    when 'expense.voided' then 'An expense that included you was cancelled.'
    when 'expense.bill_paid' then 'A bill that includes you was paid.'
    when 'expense.collector_set' then 'You were asked to pay a bill for your apartment.'
    when 'expense.dispute_raised' then 'An expense that includes you was disputed.'
    when 'expense.dispute_accepted' then 'A dispute on an expense that includes you was answered.'
    when 'expense.dispute_rejected' then 'A dispute on an expense that includes you was answered.'
    when 'expense.dispute_decided' then 'A dispute on an expense that includes you was decided.'
    when 'expense.dispute_withdrawn' then 'A dispute on an expense that includes you was withdrawn.'
    when 'payment.recorded' then 'A flatmate recorded a payment to you. Check that it arrived.'
    when 'payment.proof_added' then 'Proof was added to a payment to you.'
    when 'payment.declined' then 'A payment you recorded was declined.'
    when 'payment.decline_withdrawn' then 'An objection to your payment was withdrawn.'
    when 'payment.confirmed_by_app_policy' then 'Your payment is now final in FlatMate. Nobody objected in time.'
    when 'payment.voided' then 'A payment you are part of was voided.'
    when 'offset.netted_off' then 'Debts between you and a flatmate were netted off.'
    when 'adjustment.recorded' then 'An adjustment between you and a flatmate was recorded.'
    when 'member.joined' then 'Someone joined your apartment.'
    when 'member.left' then 'A member left your apartment.'
    when 'member.removed' then 'A member was removed from your apartment.'
    when 'member.you_were_removed' then 'You were removed from an apartment.'
    when 'member.role_changed' then 'Your role in an apartment changed.'
    when 'member.expense_permission_changed' then 'Your permission to add expenses changed.'
    when 'settlement_period.closed' then 'A settlement period closed. See the summary.'
    when 'join_request.requested' then 'Someone asked to join your apartment.'
    when 'join_request.approved' then 'Your request to join an apartment was approved.'
    when 'join_request.declined' then 'Your request to join an apartment was declined.'
    when 'rejoin_invite.sent' then 'You were invited back to an apartment.'
    when 'rejoin_invite.declined' then 'Someone declined your invitation to rejoin.'
    when 'recurring_bill.amount_needed' then 'A repeatable bill arrived. Enter its amount.'
    when 'recurring_bill.needs_review' then 'A repeatable expense needs its split checked.'
    when 'reminder.bill_due_soon' then 'A bill for your apartment is due soon and not paid yet.'
    when 'reminder.bill_due_today' then 'A bill for your apartment is due today and not paid yet.'
    when 'reminder.settlement_soon' then 'Settlement day is coming up. Check what you owe.'
    when 'budget.near_limit' then 'Your apartment has used 80% of a monthly budget.'
    when 'budget.over_limit' then 'Your apartment has reached a monthly budget.'
    when 'deposit.recorded' then 'A security deposit with your share was recorded.'
    when 'deposit.share_taken_over' then 'A security deposit share of yours changed hands.'
    when 'deposit.share_refunded' then 'Your security deposit share was refunded.'
    when 'deposit.returned' then 'A security deposit you share was returned.'
    when 'deposit.undone' then 'A change to a security deposit you share was undone.'
    else 'Something changed in FlatMate.'
  end;
$$;

-- As in 20261124140000_add_activity_history.sql, with deposits among payments.
create or replace function private.activity_group(p_entity_type text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type = 'expense' and p_action like 'dispute\_%' then 'disputes'
    when p_entity_type = 'expense' then 'expenses'
    when p_entity_type in ('payment', 'offset', 'adjustment', 'settlement_period', 'deposit') then 'payments'
    when p_entity_type in ('member', 'join_request', 'rejoin_invite', 'invite') then 'members'
    else 'settings'
  end
$$;

-- As in 20261124140000_add_activity_history.sql, naming deposits and the
-- people in a deposit action.
create or replace function public.get_activity(
  p_apartment_id uuid,
  p_group text default null,
  p_actor_id uuid default null,
  p_before bigint default null,
  p_limit integer default 30
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  details jsonb,
  subject text,
  amount_minor bigint,
  person_id uuid,
  counterparty_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_group is not null and p_group not in ('expenses', 'disputes', 'payments', 'members', 'settings') then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  return query
  select e.id, e.created_at, e.actor_id, e.entity_type, e.entity_id, e.action, e.details,
    case e.entity_type
      when 'expense' then x.title
      when 'expense_template' then t.title
      when 'recurring_template' then rt.title
      when 'recurring_bill' then rbt.title
      when 'category' then c.name
      when 'budget' then bc.name
      when 'deposit' then dp.title
    end,
    case e.entity_type
      when 'expense' then x.amount_minor
      when 'payment' then p.amount_minor
      when 'offset' then o.amount_minor
      when 'adjustment' then a.amount_minor
      when 'deposit' then (e.details ->> 'amount_minor')::bigint
    end,
    case e.entity_type
      when 'payment' then p.payer_id
      when 'offset' then o.initiator_id
      when 'adjustment' then a.debtor_id
      when 'member' then e.entity_id
      when 'join_request' then (e.details ->> 'user_id')::uuid
      when 'rejoin_invite' then (e.details ->> 'user_id')::uuid
      when 'deposit' then (e.details ->> 'user_id')::uuid
    end,
    case e.entity_type
      when 'payment' then p.recipient_id
      when 'offset' then o.counterparty_id
      when 'adjustment' then a.creditor_id
      when 'deposit' then (e.details ->> 'counterparty_id')::uuid
    end
  from public.audit_events e
  left join public.expenses x on e.entity_type = 'expense' and x.id = e.entity_id
  left join public.expense_templates t on e.entity_type = 'expense_template' and t.id = e.entity_id
  left join public.recurring_templates rt on e.entity_type = 'recurring_template' and rt.id = e.entity_id
  left join public.recurring_instances ri on e.entity_type = 'recurring_bill' and ri.id = e.entity_id
  left join public.recurring_templates rbt on rbt.id = ri.template_id
  left join public.expense_categories c on e.entity_type = 'category' and c.id = e.entity_id
  left join public.expense_categories bc
    on e.entity_type = 'budget' and bc.id = (e.details ->> 'category_id')::uuid
  left join public.payments p on e.entity_type = 'payment' and p.id = e.entity_id
  left join public.offsets o on e.entity_type = 'offset' and o.id = e.entity_id
  left join public.adjustments a on e.entity_type = 'adjustment' and a.id = e.entity_id
  left join public.deposits dp on e.entity_type = 'deposit' and dp.id = e.entity_id
  where e.apartment_id = p_apartment_id
    and (p_before is null or e.id < p_before)
    and (p_actor_id is null or e.actor_id = p_actor_id)
    and (p_group is null or private.activity_group(e.entity_type, e.action) = p_group)
  order by e.id desc
  limit p_limit;
end;
$$;
