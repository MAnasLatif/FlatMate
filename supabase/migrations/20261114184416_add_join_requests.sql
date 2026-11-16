-- Joining an apartment now needs an admin's approval (SRS FR-02.2, decided
-- 2026-11-14). A valid join code creates a request; any current admin of the
-- apartment approves or declines it, and the first to act decides. The person
-- asking sees their pending requests and can cancel them. After a decline they
-- may ask again with a valid code; the join-code rate limit still applies.
--
-- join_apartment keeps its signature. It now answers 'requested' (a new
-- request) or 'pending' (one is already waiting) instead of 'joined';
-- 'already_member', 'invalid_code' and 'rate_limited' are unchanged.

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The code used, for the audit trail; kept when the code is later removed.
  invite_id uuid references public.apartment_invites (id) on delete set null,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- The admin who decided, or the person themselves when they cancelled.
  decided_by uuid references public.profiles (id) on delete set null,
  constraint join_requests_state_valid check (state in ('pending', 'approved', 'declined', 'cancelled')),
  constraint join_requests_decided check ((state = 'pending') = (decided_at is null))
);

create unique index join_requests_one_pending
on public.join_requests (apartment_id, user_id)
where state = 'pending';

create index join_requests_user on public.join_requests (user_id, created_at desc);

-- Requests are reached only through the functions below, which check who is
-- asking: the person who asked, or an admin of the apartment.
alter table public.join_requests enable row level security;
revoke all on table public.join_requests from anon, authenticated;

-- A declined request leads home in the app, so notifications may point at one.
alter table public.notifications drop constraint notifications_record_type_valid;
alter table public.notifications add constraint notifications_record_type_valid check (
  record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment', 'join_request')
);

-- Asking to join --------------------------------------------------------------------------

create or replace function private.join_apartment(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  joiner uuid := private.require_user();
  recent_failures integer;
  invite record;
  apartment_name text;
  request_id uuid;
begin
  select count(*) into recent_failures
  from private.join_attempts
  where user_id = joiner
    and not succeeded
    and attempted_at > now() - interval '15 minutes';

  if recent_failures >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select i.id, i.apartment_id into invite
  from public.apartment_invites i
  where i.code_hash = private.hash_invite_code(p_code)
    and i.revoked_at is null
    and i.expires_at > now();

  if invite.id is null then
    insert into private.join_attempts (user_id, succeeded) values (joiner, false);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  insert into private.join_attempts (user_id, succeeded) values (joiner, true);

  if exists (
    select 1 from public.apartment_members
    where apartment_id = invite.apartment_id and user_id = joiner and left_at is null
  ) then
    return jsonb_build_object('status', 'already_member', 'apartment_id', invite.apartment_id);
  end if;

  select name into apartment_name from public.apartments where id = invite.apartment_id;

  -- One pending request per person and apartment; asking again is answered
  -- with the request already waiting.
  select id into request_id from public.join_requests
  where apartment_id = invite.apartment_id and user_id = joiner and state = 'pending';
  if request_id is not null then
    return jsonb_build_object(
      'status', 'pending', 'request_id', request_id,
      'apartment_id', invite.apartment_id, 'apartment_name', apartment_name);
  end if;

  insert into public.join_requests (apartment_id, user_id, invite_id)
  values (invite.apartment_id, joiner, invite.id)
  returning id into request_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (invite.apartment_id, joiner, 'join_request', request_id, 'requested',
          jsonb_build_object('user_id', joiner, 'invite_id', invite.id));

  return jsonb_build_object(
    'status', 'requested', 'request_id', request_id,
    'apartment_id', invite.apartment_id, 'apartment_name', apartment_name);
end;
$$;


-- Deciding ------------------------------------------------------------------------------

-- An admin approves or declines a pending request. Approving adds the person
-- as a member, recorded as their joining.
create function private.decide_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_user();
  request public.join_requests;
  joins boolean;
begin
  select * into request from public.join_requests where id = p_request_id for update;
  -- Someone who is not an admin learns nothing about the request.
  if request.id is null or not private.is_apartment_admin(request.apartment_id) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if request.state <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;

  update public.join_requests
  set state = case when p_approve then 'approved' else 'declined' end,
      decided_at = now(),
      decided_by = admin
  where id = request.id;

  joins := p_approve and not private.is_current_member_of(request.apartment_id, request.user_id);
  if joins then
    insert into public.apartment_members (apartment_id, user_id, role)
    values (request.apartment_id, request.user_id, 'member');
  end if;

  -- One statement, so the person who asked gets one change event for both
  -- rows. Joining is recorded as the person joining, as before, so flatmates
  -- see who joined.
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  select request.apartment_id, row.actor_id, row.entity_type, row.entity_id, row.action, row.details
  from (values
    (request.user_id, 'member', request.user_id, 'joined',
     jsonb_build_object('invite_id', request.invite_id, 'join_request_id', request.id,
                        'approved_by', admin), joins),
    (admin, 'join_request', request.id,
     case when p_approve then 'approved' else 'declined' end,
     jsonb_build_object('user_id', request.user_id), true)
  ) as row(actor_id, entity_type, entity_id, action, details, wanted)
  where row.wanted;
end;
$$;

-- The person who asked withdraws a pending request.
create function private.cancel_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  request public.join_requests;
begin
  select * into request from public.join_requests
  where id = p_request_id and user_id = me
  for update;
  if request.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if request.state <> 'pending' then
    raise exception 'request_not_pending' using errcode = '22023';
  end if;

  update public.join_requests
  set state = 'cancelled', decided_at = now(), decided_by = me
  where id = request.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (request.apartment_id, me, 'join_request', request.id, 'cancelled',
          jsonb_build_object('user_id', me));
end;
$$;

-- Reading -------------------------------------------------------------------------------

-- The caller's own pending requests, with the apartment's name, which they
-- cannot read otherwise until they are a member.
create function private.get_my_join_requests()
returns table (id uuid, apartment_id uuid, apartment_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.apartment_id, a.name, r.created_at
  from public.join_requests r
  join public.apartments a on a.id = r.apartment_id
  where r.user_id = (select auth.uid()) and r.state = 'pending'
  order by r.created_at desc
$$;

-- An apartment's pending requests, for its admins, with who is asking.
create function private.get_join_requests(p_apartment_id uuid)
returns table (id uuid, user_id uuid, display_name text, avatar_path text, created_at timestamptz)
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
  select r.id, r.user_id, p.display_name, p.avatar_path, r.created_at
  from public.join_requests r
  join public.profiles p on p.id = r.user_id
  where r.apartment_id = p_apartment_id and r.state = 'pending'
  order by r.created_at;
end;
$$;

revoke execute on function private.decide_join_request(uuid, boolean) from public;
revoke execute on function private.cancel_join_request(uuid) from public;
revoke execute on function private.get_my_join_requests() from public;
revoke execute on function private.get_join_requests(uuid) from public;
grant execute on function private.decide_join_request(uuid, boolean) to authenticated;
grant execute on function private.cancel_join_request(uuid) to authenticated;
grant execute on function private.get_my_join_requests() to authenticated;
grant execute on function private.get_join_requests(uuid) to authenticated;

-- RPC endpoints ----------------------------------------------------------------------------

create function public.approve_join_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.decide_join_request(p_request_id, true) $$;

create function public.decline_join_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.decide_join_request(p_request_id, false) $$;

create function public.cancel_join_request(p_request_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.cancel_join_request(p_request_id) $$;

create function public.get_my_join_requests()
returns table (id uuid, apartment_id uuid, apartment_name text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_my_join_requests() $$;

create function public.get_join_requests(p_apartment_id uuid)
returns table (id uuid, user_id uuid, display_name text, avatar_path text, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_join_requests(p_apartment_id) $$;

revoke execute on function public.approve_join_request(uuid) from public, anon;
revoke execute on function public.decline_join_request(uuid) from public, anon;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
revoke execute on function public.get_my_join_requests() from public, anon;
revoke execute on function public.get_join_requests(uuid) from public, anon;
grant execute on function public.approve_join_request(uuid) to authenticated;
grant execute on function public.decline_join_request(uuid) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.get_my_join_requests() to authenticated;
grant execute on function public.get_join_requests(uuid) to authenticated;

-- Notifications and change events -------------------------------------------------------

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
    else 'Something changed in FlatMate.'
  end;
$$;

-- A join request's events also reach the person who asked, on their own topic.
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
    select entity_id as user_id from added where entity_type = 'member' and entity_id is not null
    union
    select actor_id from added where entity_type = 'apartment' and action = 'created' and actor_id is not null
    union
    -- The person asking to join sees their pending requests change.
    select (details ->> 'user_id')::uuid from added
    where entity_type = 'join_request' and details ? 'user_id'
  ) person;

  return null;
end;
$$;
