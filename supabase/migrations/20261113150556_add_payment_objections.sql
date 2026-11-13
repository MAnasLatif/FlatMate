-- Objecting to payments, and confirming them by app policy (SRS FR-07.5,
-- FR-07.6, FR-07.8, AC-07, AC-08, section 12 item 3, decision record 0005).
--
-- The recipient of a payment can decline it with a reason. Inside the
-- objection window the payment becomes 'disputed' and stops counting as paid;
-- the window pauses. After the window it is a late case that changes nothing
-- final. The recipient can withdraw the objection, and the payer can void a
-- payment that is not final. With no objection, a scheduled job makes the
-- payment final: confirmed by app policy, never bank-verified. Nobody, admins
-- included, can certify that money was received.

create function private.can_view_payment(p_payment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
    where p.id = p_payment_id
      and (p.payer_id = (select auth.uid()) or p.recipient_id = (select auth.uid())
           or private.is_apartment_admin(p.apartment_id))
  );
$$;

revoke execute on function private.can_view_payment(uuid) from public;
grant execute on function private.can_view_payment(uuid) to authenticated;

create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  raised_by uuid not null references public.profiles (id) on delete restrict,
  reason text not null,
  -- Raised after the payment's window closed: a case that holds nothing.
  is_late boolean not null,
  -- What was left of the window when the objection paused it.
  window_remaining interval,
  state text not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_disputes_reason_valid check (char_length(reason) between 1 and 1000 and reason = btrim(reason)),
  constraint payment_disputes_window_valid check (is_late = (window_remaining is null)),
  constraint payment_disputes_state_valid check (state in ('open', 'resolved')),
  constraint payment_disputes_resolution_valid check (
    (state = 'resolved') = (resolution is not null and resolved_at is not null)
  ),
  constraint payment_disputes_resolution_kind check (resolution is null or resolution in ('withdrawn', 'voided'))
);

create unique index payment_disputes_one_open on public.payment_disputes (payment_id) where state = 'open';
create index payment_disputes_apartment on public.payment_disputes (apartment_id, state);
create index payment_disputes_raised_by on public.payment_disputes (raised_by);
create index payment_disputes_resolved_by on public.payment_disputes (resolved_by) where resolved_by is not null;

create table public.payment_dispute_events (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references public.payment_disputes (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  message text,
  created_at timestamptz not null default now(),
  constraint payment_dispute_events_action_valid check (action in ('raised', 'withdrawn', 'voided')),
  constraint payment_dispute_events_message_valid check (message is null or char_length(message) between 1 and 1000)
);

create index payment_dispute_events_dispute on public.payment_dispute_events (dispute_id, id);
create index payment_dispute_events_actor on public.payment_dispute_events (actor_id);

create trigger payment_dispute_events_immutable before update or delete on public.payment_dispute_events
for each row execute function private.reject_change();

alter table public.payment_disputes enable row level security;
alter table public.payment_dispute_events enable row level security;
revoke all on table public.payment_disputes, public.payment_dispute_events from anon, authenticated;
grant select on table public.payment_disputes, public.payment_dispute_events to authenticated;

create policy "People who can see a payment can see objections to it"
on public.payment_disputes
for select
to authenticated
using ((select private.can_view_payment(payment_id)));

create policy "People who can see a payment can see the history of objections to it"
on public.payment_dispute_events
for select
to authenticated
using (exists (
  select 1 from public.payment_disputes d
  where d.id = dispute_id and (select private.can_view_payment(d.payment_id))
));

-- Declining ---------------------------------------------------------------------------------

-- The recipient declines a payment, for example because the money never
-- arrived. Declining the same payment again returns the open objection.
create function private.decline_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid := private.require_user();
  payment public.payments;
  reason text := btrim(p_reason);
  existing uuid;
  late boolean;
  new_dispute uuid;
begin
  select * into payment from public.payments where id = p_payment_id for update;
  if payment.id is null or not private.has_membership_history(payment.apartment_id)
     or payment.recipient_id <> recipient then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select id into existing from public.payment_disputes where payment_id = payment.id and state = 'open';
  if existing is not null then
    return existing;
  end if;
  if payment.status = 'void' then
    raise exception 'payment_void' using errcode = 'P0001';
  end if;
  if reason is null or reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  late := payment.status = 'final' or now() >= payment.finalize_after;
  insert into public.payment_disputes (apartment_id, payment_id, raised_by, reason, is_late, window_remaining)
  values (payment.apartment_id, payment.id, recipient, reason, late,
          case when late then null else payment.finalize_after - now() end)
  returning id into new_dispute;

  if not late then
    update public.payments set status = 'disputed' where id = payment.id;
  end if;

  insert into public.payment_dispute_events (dispute_id, actor_id, action, message)
  values (new_dispute, recipient, 'raised', reason);
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (payment.apartment_id, recipient, 'payment', payment.id, 'declined');

  return new_dispute;
end;
$$;

-- The recipient takes back an objection. A payment it held counts as paid
-- again and its window resumes with the time that was left.
create function private.withdraw_payment_decline(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_user();
  dispute public.payment_disputes;
begin
  select * into dispute from public.payment_disputes where id = p_dispute_id for update;
  if dispute.id is null or not private.can_view_payment(dispute.payment_id) then
    raise exception 'dispute_not_found' using errcode = 'P0002';
  end if;
  if dispute.raised_by <> actor then
    raise exception 'not_dispute_raiser' using errcode = '42501';
  end if;
  if dispute.state = 'resolved' and dispute.resolution = 'withdrawn' then
    return;
  end if;
  if dispute.state = 'resolved' then
    raise exception 'dispute_not_open' using errcode = 'P0001';
  end if;

  if not dispute.is_late then
    update public.payments
    set status = 'provisional', finalize_after = now() + dispute.window_remaining
    where id = dispute.payment_id and status = 'disputed';
  end if;
  update public.payment_disputes
  set state = 'resolved', resolution = 'withdrawn', resolved_by = actor, resolved_at = now()
  where id = dispute.id;

  insert into public.payment_dispute_events (dispute_id, actor_id, action) values (dispute.id, actor, 'withdrawn');
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (dispute.apartment_id, actor, 'payment', dispute.payment_id, 'decline_withdrawn');
end;
$$;

-- The payer cancels a payment that is not final, for example one recorded by
-- mistake or one the recipient says never arrived. It stops counting, stays
-- in the history, and closes any open objection. A final payment is
-- corrected by an adjustment instead, so closed figures never move.
create function private.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payer uuid := private.require_user();
  payment public.payments;
  message text := nullif(btrim(p_reason), '');
  dispute public.payment_disputes;
begin
  select * into payment from public.payments where id = p_payment_id for update;
  if payment.id is null or not private.has_membership_history(payment.apartment_id)
     or payment.payer_id <> payer then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if payment.status = 'void' then
    return;
  end if;
  if payment.status = 'final' then
    raise exception 'payment_final' using errcode = 'P0001';
  end if;
  if message is not null and char_length(message) > 1000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  update public.payments set status = 'void' where id = payment.id;

  select * into dispute from public.payment_disputes where payment_id = payment.id and state = 'open' for update;
  if dispute.id is not null then
    update public.payment_disputes
    set state = 'resolved', resolution = 'voided', resolved_by = payer, resolved_at = now()
    where id = dispute.id;
    insert into public.payment_dispute_events (dispute_id, actor_id, action, message)
    values (dispute.id, payer, 'voided', message);
  end if;
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (payment.apartment_id, payer, 'payment', payment.id, 'voided');
end;
$$;

revoke execute on function private.decline_payment(uuid, text) from public;
revoke execute on function private.withdraw_payment_decline(uuid) from public;
revoke execute on function private.void_payment(uuid, text) from public;
grant execute on function private.decline_payment(uuid, text) to authenticated;
grant execute on function private.withdraw_payment_decline(uuid) to authenticated;
grant execute on function private.void_payment(uuid, text) to authenticated;

create function public.decline_payment(p_payment_id uuid, p_reason text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.decline_payment(p_payment_id, p_reason) $$;

create function public.withdraw_payment_decline(p_dispute_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.withdraw_payment_decline(p_dispute_id) $$;

create function public.void_payment(p_payment_id uuid, p_reason text default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.void_payment(p_payment_id, p_reason) $$;

revoke execute on function public.decline_payment(uuid, text) from public, anon;
revoke execute on function public.withdraw_payment_decline(uuid) from public, anon;
revoke execute on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.decline_payment(uuid, text) to authenticated;
grant execute on function public.withdraw_payment_decline(uuid) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- Confirming by app policy ----------------------------------------------------------------

-- Makes provisional payments whose window has closed final, as confirmed by
-- app policy, and logs each one. Safe to run twice or twice at once, like
-- finalize_due_expenses. Returns how many payments it confirmed.
create function private.finalize_due_payments()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  confirmed_count integer;
begin
  with due as (
    update public.payments p
    set status = 'final', finalized_at = now()
    where p.id in (
      select x.id from public.payments x
      where x.status = 'provisional' and x.finalize_after <= now()
      order by x.finalize_after
      limit 1000
      for update skip locked
    )
    returning p.id, p.apartment_id
  ),
  logged as (
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
    select due.apartment_id, null, 'payment', due.id, 'confirmed_by_app_policy' from due
    returning 1
  )
  select count(*)::integer into confirmed_count from logged;
  return confirmed_count;
end;
$$;

revoke execute on function private.finalize_due_payments() from public;

select cron.schedule('finalize-payments', '*/5 * * * *', $$ select private.finalize_due_payments() $$);
