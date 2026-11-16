-- Two admin tools for former members, decided by the owner on 2026-11-15.
--
-- Removing a former member from the list hides them from the apartment's
-- Former members list. It changes nothing else: their expenses, payments and
-- balances stay exactly as they were, their name still shows on those
-- records, and they can still ask to join again with a code.
--
-- Inviting a former member back asks them, without a code, to become a
-- member again. They accept or decline; accepting adds them as a member, in
-- the same way as an approved join request.

-- Hiding a former member ---------------------------------------------------------------

-- Who hid them is in audit_events. A column referencing profiles here would
-- give apartment_members a second link to profiles, and the app's embedded
-- profile lookup, already on phones, would stop working.
alter table public.apartment_members
  add column hidden_at timestamptz,
  add constraint apartment_members_hidden_only_former check (hidden_at is null or left_at is not null);

create function private.hide_former_member(p_apartment_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_user();
  hidden integer;
begin
  if not private.is_apartment_admin(p_apartment_id) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if private.is_current_member_of(p_apartment_id, p_user_id) then
    raise exception 'still_a_member' using errcode = '22023';
  end if;

  update public.apartment_members
  set hidden_at = now()
  where apartment_id = p_apartment_id and user_id = p_user_id
    and left_at is not null and hidden_at is null;
  get diagnostics hidden = row_count;
  -- Hiding twice is not an error: the list already looks as asked.
  if hidden = 0 then
    if not exists (select 1 from public.apartment_members
                   where apartment_id = p_apartment_id and user_id = p_user_id) then
      raise exception 'member_not_found' using errcode = 'P0002';
    end if;
    return;
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, admin, 'member', p_user_id, 'hidden');
end;
$$;

-- Inviting a former member back ------------------------------------------------------

create table public.rejoin_invites (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint rejoin_invites_state_valid check (state in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint rejoin_invites_decided check ((state = 'pending') = (decided_at is null))
);

create unique index rejoin_invites_one_pending
on public.rejoin_invites (apartment_id, user_id)
where state = 'pending';

create index rejoin_invites_user on public.rejoin_invites (user_id) where state = 'pending';

-- Reached only through the functions below, which check who is asking: the
-- person invited, or an admin of the apartment.
alter table public.rejoin_invites enable row level security;
revoke all on table public.rejoin_invites from anon, authenticated;

-- An invitation leads to the user's list of apartments, where they answer it.
alter table public.notifications drop constraint notifications_record_type_valid;
alter table public.notifications add constraint notifications_record_type_valid check (
  record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment',
                  'join_request', 'rejoin_invite')
);

-- An admin invites someone who used to be a member. Inviting again while an
-- invitation waits returns that one, so a retried tap sends nothing twice.
create function private.invite_back(p_apartment_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_user();
  invite_id uuid;
begin
  if not private.is_apartment_admin(p_apartment_id) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if private.is_current_member_of(p_apartment_id, p_user_id) then
    raise exception 'already_member' using errcode = '22023';
  end if;
  if not exists (select 1 from public.apartment_members
                 where apartment_id = p_apartment_id and user_id = p_user_id and left_at is not null) then
    raise exception 'not_former_member' using errcode = 'P0002';
  end if;

  -- Two admins inviting at once: the second waits here and finds the first.
  perform pg_advisory_xact_lock(hashtextextended(p_apartment_id::text || p_user_id::text, 0));
  select id into invite_id from public.rejoin_invites
  where apartment_id = p_apartment_id and user_id = p_user_id and state = 'pending';
  if invite_id is not null then
    return invite_id;
  end if;

  insert into public.rejoin_invites (apartment_id, user_id, invited_by)
  values (p_apartment_id, p_user_id, admin)
  returning id into invite_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin, 'rejoin_invite', invite_id, 'sent',
          jsonb_build_object('user_id', p_user_id));
  return invite_id;
end;
$$;

-- The person invited accepts or declines. Accepting makes them a member again,
-- recorded as their joining, so flatmates see who joined.
create function private.answer_rejoin_invite(p_invite_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  invite public.rejoin_invites;
  joins boolean;
begin
  select * into invite from public.rejoin_invites
  where id = p_invite_id and user_id = me
  for update;
  if invite.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if invite.state <> 'pending' then
    raise exception 'invite_not_pending' using errcode = '22023';
  end if;

  update public.rejoin_invites
  set state = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
  where id = invite.id;

  joins := p_accept and not private.is_current_member_of(invite.apartment_id, me);
  if joins then
    insert into public.apartment_members (apartment_id, user_id, role)
    values (invite.apartment_id, me, 'member');
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  select invite.apartment_id, me, row.entity_type, row.entity_id, row.action, row.details
  from (values
    ('member', me, 'joined',
     jsonb_build_object('rejoin_invite_id', invite.id, 'invited_by', invite.invited_by), joins),
    ('rejoin_invite', invite.id, case when p_accept then 'accepted' else 'declined' end,
     jsonb_build_object('user_id', me, 'invited_by', invite.invited_by), true)
  ) as row(entity_type, entity_id, action, details, wanted)
  where row.wanted;

  return invite.apartment_id;
end;
$$;

-- An admin withdraws an invitation that is still waiting.
create function private.cancel_rejoin_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_user();
  invite public.rejoin_invites;
begin
  select * into invite from public.rejoin_invites where id = p_invite_id for update;
  if invite.id is null or not private.is_apartment_admin(invite.apartment_id) then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if invite.state <> 'pending' then
    raise exception 'invite_not_pending' using errcode = '22023';
  end if;

  update public.rejoin_invites set state = 'cancelled', decided_at = now() where id = invite.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (invite.apartment_id, admin, 'rejoin_invite', invite.id, 'cancelled',
          jsonb_build_object('user_id', invite.user_id));
end;
$$;

-- The caller's waiting invitations, with the apartment's name and who invited
-- them, which a former member cannot read otherwise.
create function private.get_my_rejoin_invites()
returns table (id uuid, apartment_id uuid, apartment_name text, invited_by_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.apartment_id, a.name, p.display_name, r.created_at
  from public.rejoin_invites r
  join public.apartments a on a.id = r.apartment_id
  left join public.profiles p on p.id = r.invited_by
  where r.user_id = (select auth.uid()) and r.state = 'pending'
  order by r.created_at desc
$$;

-- An apartment's waiting invitations, for its admins.
create function private.get_rejoin_invites(p_apartment_id uuid)
returns table (id uuid, user_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_apartment_admin(p_apartment_id) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, r.created_at
  from public.rejoin_invites r
  where r.apartment_id = p_apartment_id and r.state = 'pending'
  order by r.created_at;
end;
$$;

revoke execute on function private.hide_former_member(uuid, uuid) from public;
revoke execute on function private.invite_back(uuid, uuid) from public;
revoke execute on function private.answer_rejoin_invite(uuid, boolean) from public;
revoke execute on function private.cancel_rejoin_invite(uuid) from public;
revoke execute on function private.get_my_rejoin_invites() from public;
revoke execute on function private.get_rejoin_invites(uuid) from public;
grant execute on function private.hide_former_member(uuid, uuid) to authenticated;
grant execute on function private.invite_back(uuid, uuid) to authenticated;
grant execute on function private.answer_rejoin_invite(uuid, boolean) to authenticated;
grant execute on function private.cancel_rejoin_invite(uuid) to authenticated;
grant execute on function private.get_my_rejoin_invites() to authenticated;
grant execute on function private.get_rejoin_invites(uuid) to authenticated;

-- RPC endpoints ----------------------------------------------------------------------------

create function public.hide_former_member(p_apartment_id uuid, p_user_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.hide_former_member(p_apartment_id, p_user_id) $$;

create function public.invite_back(p_apartment_id uuid, p_user_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.invite_back(p_apartment_id, p_user_id) $$;

create function public.accept_rejoin_invite(p_invite_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.answer_rejoin_invite(p_invite_id, true) $$;

create function public.decline_rejoin_invite(p_invite_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.answer_rejoin_invite(p_invite_id, false) $$;

create function public.cancel_rejoin_invite(p_invite_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.cancel_rejoin_invite(p_invite_id) $$;

create function public.get_my_rejoin_invites()
returns table (id uuid, apartment_id uuid, apartment_name text, invited_by_name text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_my_rejoin_invites() $$;

create function public.get_rejoin_invites(p_apartment_id uuid)
returns table (id uuid, user_id uuid, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_rejoin_invites(p_apartment_id) $$;

revoke execute on function public.hide_former_member(uuid, uuid) from public, anon;
revoke execute on function public.invite_back(uuid, uuid) from public, anon;
revoke execute on function public.accept_rejoin_invite(uuid) from public, anon;
revoke execute on function public.decline_rejoin_invite(uuid) from public, anon;
revoke execute on function public.cancel_rejoin_invite(uuid) from public, anon;
revoke execute on function public.get_my_rejoin_invites() from public, anon;
revoke execute on function public.get_rejoin_invites(uuid) from public, anon;
grant execute on function public.hide_former_member(uuid, uuid) to authenticated;
grant execute on function public.invite_back(uuid, uuid) to authenticated;
grant execute on function public.accept_rejoin_invite(uuid) to authenticated;
grant execute on function public.decline_rejoin_invite(uuid) to authenticated;
grant execute on function public.cancel_rejoin_invite(uuid) to authenticated;
grant execute on function public.get_my_rejoin_invites() to authenticated;
grant execute on function public.get_rejoin_invites(uuid) to authenticated;

-- Notifications and change events -------------------------------------------------------

-- As in 20261114200816_add_bill_collector.sql, with the two rejoin_invite
-- branches at the end. 'member.hidden' tells nobody.
create or replace function private.notification_recipients(e public.audit_events)
returns table (user_id uuid, type text, record_type text, record_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := e.entity_type || '.' || e.action;
  payment public.payments;
begin
  if kind in ('expense.created', 'expense.edited', 'expense.voided', 'expense.bill_paid') then
    return query
    select p.user_id, kind, 'expense'::text, e.entity_id
    from private.expense_people(e.entity_id) p
    where private.is_current_member_of(e.apartment_id, p.user_id);

  elsif kind in ('expense.dispute_raised', 'expense.dispute_accepted', 'expense.dispute_rejected',
                 'expense.dispute_decided', 'expense.dispute_withdrawn') then
    return query
    select p.user_id, kind, 'dispute'::text, (e.details ->> 'dispute_id')::uuid
    from private.expense_people(e.entity_id) p
    where private.is_current_member_of(e.apartment_id, p.user_id);

  elsif e.entity_type = 'payment' then
    select * into payment from public.payments where id = e.entity_id;
    return query
    select person, kind, 'payment'::text, payment.id
    from unnest(case e.action
      when 'recorded' then array[payment.recipient_id]
      when 'proof_added' then array[payment.recipient_id]
      when 'declined' then array[payment.payer_id]
      when 'decline_withdrawn' then array[payment.payer_id]
      when 'confirmed_by_app_policy' then array[payment.payer_id]
      when 'voided' then array[payment.payer_id, payment.recipient_id]
      else array[]::uuid[]
    end) person
    where person is not null;

  elsif kind = 'offset.netted_off' then
    -- Each side lands on their ledger with the other.
    return query
    select o.counterparty_id, kind, 'ledger'::text, o.initiator_id from public.offsets o where o.id = e.entity_id
    union all
    select o.initiator_id, kind, 'ledger'::text, o.counterparty_id from public.offsets o where o.id = e.entity_id;

  elsif kind = 'adjustment.recorded' then
    return query
    select a.debtor_id, kind, 'ledger'::text, a.creditor_id from public.adjustments a where a.id = e.entity_id
    union all
    select a.creditor_id, kind, 'ledger'::text, a.debtor_id from public.adjustments a where a.id = e.entity_id;

  elsif kind in ('member.joined', 'member.left', 'member.removed') then
    return query
    select m.user_id, kind, 'members'::text, e.entity_id
    from public.apartment_members m
    where m.apartment_id = e.apartment_id and m.left_at is null and m.role = 'admin'
      and m.user_id <> e.entity_id;
    if e.action = 'removed' then
      -- The removed member is no longer a member; they land on the apartment,
      -- which they still see as a former member.
      return query select e.entity_id, 'member.you_were_removed'::text, 'apartment'::text, e.apartment_id;
    end if;

  elsif kind in ('member.role_changed', 'member.expense_permission_changed') then
    return query select e.entity_id, kind, 'members'::text, e.entity_id;

  elsif kind = 'settlement_period.closed' then
    return query
    select m.user_id, kind, 'settlement'::text, e.entity_id
    from public.apartment_members m
    where m.apartment_id = e.apartment_id and m.left_at is null;

  elsif kind = 'expense.collector_set' then
    -- The person asked to pay the bill, unless they set it themselves.
    return query
    select (e.details ->> 'collector_id')::uuid, kind, 'expense'::text, e.entity_id
    where e.details ->> 'collector_id' is not null;

  elsif kind = 'join_request.requested' then
    -- Every admin can decide; the first to act does.
    return query
    select m.user_id, kind, 'members'::text, e.entity_id
    from public.apartment_members m
    where m.apartment_id = e.apartment_id and m.left_at is null and m.role = 'admin';

  elsif kind = 'join_request.approved' then
    return query select (e.details ->> 'user_id')::uuid, kind, 'apartment'::text, e.apartment_id;

  elsif kind = 'join_request.declined' then
    -- They cannot open the apartment, so the notification leads home.
    return query select (e.details ->> 'user_id')::uuid, kind, 'join_request'::text, e.entity_id;

  elsif kind = 'rejoin_invite.sent' then
    -- They answer it in their list of apartments.
    return query select (e.details ->> 'user_id')::uuid, kind, 'rejoin_invite'::text, e.entity_id;

  elsif kind = 'rejoin_invite.declined' then
    -- The admin who invited, if they still are one. Accepting is told as member.joined.
    return query
    select m.user_id, kind, 'members'::text, e.entity_id
    from public.apartment_members m
    where m.apartment_id = e.apartment_id and m.left_at is null and m.role = 'admin'
      and m.user_id = (e.details ->> 'invited_by')::uuid;
  end if;
end;
$$;

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
    else 'Something changed in FlatMate.'
  end;
$$;

-- As in 20261114184416_add_join_requests.sql, and an invitation's events also
-- reach the person invited, on their own topic. A hidden member is told
-- nothing: hiding changes only the apartment's list.
create or replace function private.emit_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.emit_change('apartment:' || changed.apartment_id, changed.entity_type)
  from (select distinct apartment_id, entity_type from added) changed;

  perform private.emit_change('user:' || person.user_id, 'membership')
  from (
    select entity_id as user_id from added
    where entity_type = 'member' and entity_id is not null and action <> 'hidden'
    union
    select actor_id from added where entity_type = 'apartment' and action = 'created' and actor_id is not null
    union
    -- The person asking to join, or invited back, sees their list change.
    select (details ->> 'user_id')::uuid from added
    where entity_type in ('join_request', 'rejoin_invite') and details ? 'user_id'
  ) person;

  return null;
end;
$$;
