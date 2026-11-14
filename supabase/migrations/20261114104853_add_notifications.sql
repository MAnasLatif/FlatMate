-- Notifications (SRS FR-09.1, FR-09.3; task 1.43).
--
-- Each notifiable change in an apartment already writes an audit_events row.
-- A trigger on that table creates one notification per person to tell, in the
-- same transaction. The in-app inbox reads them; push delivery is a queue that
-- an Edge Function works through (supabase/functions/deliver-push).
--
-- Push text is generic on purpose: it shows on lock screens, so it never names
-- people, amounts or accounts. The inbox, behind sign-in, gives the details.

create extension if not exists pg_net with schema extensions;

-- Tables ---------------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  audit_event_id bigint references public.audit_events (id) on delete cascade,
  -- What happened, such as 'expense.created'; the app words it.
  type text not null,
  -- Where opening it goes. The screen there checks access again (FR-09.3).
  record_type text not null,
  record_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Push delivery, never shown to clients.
  push_status text not null default 'pending',
  push_attempts integer not null default 0,
  push_next_attempt_at timestamptz not null default now(),
  push_claimed_at timestamptz,
  pushed_at timestamptz,
  push_error text,
  constraint notifications_type_valid check (type ~ '^[a-z_]+\.[a-z_]+$'),
  constraint notifications_record_type_valid check (
    record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment')
  ),
  constraint notifications_push_status_valid check (
    push_status in ('pending', 'sending', 'sent', 'failed', 'skipped')
  ),
  -- A change notifies each person at most once, however often anything retries.
  constraint notifications_once_per_event unique (audit_event_id, user_id)
);

create index notifications_inbox on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create index notifications_push_due on public.notifications (push_next_attempt_at)
where push_status in ('pending', 'sending', 'failed');

comment on table public.notifications is
  'One row per person told about a change. Push columns are internal to delivery.';

-- Expo push tokens, one per device. A device that signs in as someone else
-- takes its token with it.
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_platform_valid check (platform in ('android', 'ios')),
  constraint push_tokens_format_valid check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$')
);

create index push_tokens_user on public.push_tokens (user_id);

-- Access ---------------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
revoke all on table public.notifications, public.push_tokens from anon, authenticated;

-- People read their own inbox, without the delivery columns. Tokens are only
-- written through the functions below and never read by clients.
grant select (id, apartment_id, type, record_type, record_id, actor_id, created_at, read_at)
on table public.notifications to authenticated;

create policy "People read their own notifications"
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

-- Who is told about what -----------------------------------------------------------------

create function private.is_current_member_of(p_apartment_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members
    where apartment_id = p_apartment_id and user_id = p_user_id and left_at is null
  );
$$;

revoke execute on function private.is_current_member_of(uuid, uuid) from public;

-- Everyone an expense involves, in any of its versions: who added it, who
-- paid, and who shares it. Someone dropped from an edited split hears about it.
create function private.expense_people(p_expense_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select created_by from public.expenses where id = p_expense_id
  union
  select user_id from public.expense_splits where expense_id = p_expense_id
  union
  select user_id from public.expense_payers where expense_id = p_expense_id;
$$;

revoke execute on function private.expense_people(uuid) from public;

-- The people to notify about one audit event, with where each should land.
-- Events missing here notify nobody. The trigger leaves out whoever acted.
create function private.notification_recipients(e public.audit_events)
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
  end if;
end;
$$;

revoke execute on function private.notification_recipients(public.audit_events) from public;

-- Creates the notifications for a statement's audit events, and tells each
-- recipient's devices their inbox changed.
create function private.create_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  with inserted as (
    insert into public.notifications (user_id, apartment_id, audit_event_id, type, record_type, record_id, actor_id)
    select r.user_id, a.apartment_id, a.id, r.type, r.record_type, r.record_id, a.actor_id
    from added a
    cross join lateral private.notification_recipients(a) r
    where r.user_id is distinct from a.actor_id
    on conflict (audit_event_id, user_id) do nothing
    returning user_id
  )
  select array_agg(distinct user_id) into recipients from inserted;

  perform private.emit_change('user:' || person, 'notification')
  from unnest(coalesce(recipients, '{}')) person;
  return null;
exception
  when others then
    -- A notification must never undo the change it is about.
    raise warning 'notifications not created: %', sqlstate;
    return null;
end;
$$;

revoke execute on function private.create_notifications() from public;

create trigger audit_events_create_notifications
after insert on public.audit_events
referencing new table as added
for each statement execute function private.create_notifications();

-- The inbox ------------------------------------------------------------------------------

-- Marks the caller's notifications read: the ones given, or all of them.
create function private.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  marked integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = me and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics marked = row_count;
  if marked > 0 then
    perform private.emit_change('user:' || me, 'notification');
  end if;
  return marked;
end;
$$;

revoke execute on function private.mark_notifications_read(uuid[]) from public;
grant execute on function private.mark_notifications_read(uuid[]) to authenticated;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language sql
security invoker
set search_path = ''
as $$ select private.mark_notifications_read(p_ids) $$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Push tokens ----------------------------------------------------------------------------

create function private.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'invalid_push_token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, me, p_platform)
  on conflict (token) do update
  set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

-- Removes the caller's token, such as at sign-out. Someone else's is left alone.
create function private.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  delete from public.push_tokens where token = p_token and user_id = me;
end;
$$;

revoke execute on function private.register_push_token(text, text) from public;
revoke execute on function private.unregister_push_token(text) from public;
grant execute on function private.register_push_token(text, text) to authenticated;
grant execute on function private.unregister_push_token(text) to authenticated;

create function public.register_push_token(p_token text, p_platform text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.register_push_token(p_token, p_platform) $$;

create function public.unregister_push_token(p_token text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.unregister_push_token(p_token) $$;

revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- Push delivery --------------------------------------------------------------------------
-- Used only by the deliver-push Edge Function, with the service role.

-- The lock-screen text for a notification type. Never personal.
create function private.push_text(p_type text)
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
    else 'Something changed in FlatMate.'
  end;
$$;

revoke execute on function private.push_text(text) from public;

-- After this many tries a push is given up on.
create function private.max_push_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

revoke execute on function private.max_push_attempts() from public;

-- Takes up to p_limit due notifications to push, one row per device. Rows are
-- locked against concurrent runs, and a claim that is never reported (the
-- function crashed) is taken again after five minutes. Notifications for
-- people without a device, or older than a day, are skipped instead.
create function private.claim_pushes(p_limit integer)
returns table (notification_id uuid, token text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed uuid[];
begin
  with due as (
    select n.id
    from public.notifications n
    where (
        (n.push_status in ('pending', 'failed') and n.push_attempts < private.max_push_attempts())
        or (n.push_status = 'sending' and n.push_claimed_at < now() - interval '5 minutes')
      )
      and n.push_next_attempt_at <= now()
    order by n.created_at
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
    for update skip locked
  ),
  skipped as (
    update public.notifications n
    set push_status = 'skipped', push_error = case when n.created_at < now() - interval '1 day' then 'expired' else 'no_device' end
    from due
    where n.id = due.id
      and (n.created_at < now() - interval '1 day'
           or not exists (select 1 from public.push_tokens t where t.user_id = n.user_id))
    returning n.id
  ),
  taken as (
    update public.notifications n
    set push_status = 'sending', push_attempts = n.push_attempts + 1, push_claimed_at = now()
    from due
    where n.id = due.id and n.id not in (select id from skipped)
    returning n.id
  )
  select coalesce(array_agg(id), '{}') into claimed from taken;

  return query
  select n.id, t.token, private.push_text(n.type)
  from public.notifications n
  join public.push_tokens t on t.user_id = n.user_id
  where n.id = any (claimed)
  order by n.created_at;
end;
$$;

-- Records what Expo said about each message. p_results:
--   [{"notification_id", "token", "ok": true}]
--   [{"notification_id", "token", "ok": false, "error": "DeviceNotRegistered" | ...}]
-- A token Expo no longer knows is deleted. A notification counts as sent once
-- any of its devices accepted it, is skipped when none of its devices exists
-- any more, and otherwise is retried later with a growing delay.
create function private.report_pushes(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_results' using errcode = '22023';
  end if;

  delete from public.push_tokens t
  using jsonb_to_recordset(p_results) r (notification_id uuid, token text, ok boolean, error text)
  where t.token = r.token and r.error = 'DeviceNotRegistered';

  with outcome as (
    select r.notification_id,
      bool_or(coalesce(r.ok, false)) as any_ok,
      bool_and(r.error = 'DeviceNotRegistered') as all_gone,
      -- Error codes only, never message text.
      left(string_agg(distinct r.error, ','), 200) as errors
    from jsonb_to_recordset(p_results) r (notification_id uuid, token text, ok boolean, error text)
    group by r.notification_id
  )
  update public.notifications n
  set push_status = case
        when o.any_ok then 'sent'
        when o.all_gone then 'skipped'
        else 'failed'
      end,
      pushed_at = case when o.any_ok then now() else n.pushed_at end,
      push_error = case when o.any_ok then null else o.errors end,
      -- 1, 2, 4, 8 minutes.
      push_next_attempt_at = now() + make_interval(mins => power(2, greatest(n.push_attempts - 1, 0))::integer),
      push_claimed_at = null
  from outcome o
  where n.id = o.notification_id and n.push_status = 'sending';
end;
$$;

-- The Edge Function calls these as the service role. Schema access alone opens
-- nothing: execute is revoked from everyone by default and granted per function.
grant usage on schema private to service_role;

revoke execute on function private.claim_pushes(integer) from public;
revoke execute on function private.report_pushes(jsonb) from public;
grant execute on function private.claim_pushes(integer) to service_role;
grant execute on function private.report_pushes(jsonb) to service_role;

create function public.claim_pushes(p_limit integer default 100)
returns table (notification_id uuid, token text, body text)
language sql
security invoker
set search_path = ''
as $$ select * from private.claim_pushes(p_limit) $$;

create function public.report_pushes(p_results jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.report_pushes(p_results) $$;

revoke execute on function public.claim_pushes(integer) from public, anon, authenticated;
revoke execute on function public.report_pushes(jsonb) from public, anon, authenticated;
grant execute on function public.claim_pushes(integer) to service_role;
grant execute on function public.report_pushes(jsonb) to service_role;

-- Asks the Edge Function to deliver, when anything is due. It reads the
-- function's address and a delivery secret from Vault; until both are set
-- (supabase/README.md) it does nothing. The secret only lets a caller start
-- a delivery run, which is harmless to repeat; the function itself holds the
-- service key, so that key never passes through the request queue.
create function private.request_push_delivery()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
begin
  if not exists (
    select 1 from public.notifications n
    where n.push_next_attempt_at <= now()
      and ((n.push_status in ('pending', 'failed') and n.push_attempts < private.max_push_attempts())
           or (n.push_status = 'sending' and n.push_claimed_at < now() - interval '5 minutes'))
  ) then
    return;
  end if;

  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_delivery_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url := base_url || '/functions/v1/deliver-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-delivery-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function private.request_push_delivery() from public;

select cron.schedule('deliver-pushes', '10 seconds', $$ select private.request_push_delivery() $$);
