-- Push receipts (SRS FR-09; task 2.5.1).
--
-- Expo's answer to a push is a ticket: it accepted the message, nothing more.
-- Whether Google or Apple took it comes later as a receipt, which Expo
-- recommends checking about 15 minutes after sending and keeps for 24 hours.
-- Each accepted push now keeps its ticket id until its receipt is read. The
-- deliver-push Edge Function reads due receipts on its runs:
--
-- - An ok receipt needs nothing more, and its ticket is deleted.
-- - DeviceNotRegistered: the app is gone from that device, so its token is deleted.
-- - Any other error stays as a row for maintainers to see, and the function
--   logs it; credential errors (InvalidCredentials, MismatchSenderId) are
--   logged as errors, since every push fails until they are fixed.
-- - No receipt yet: asked again later. One still missing after a day is
--   recorded as NoReceipt, which points at Expo's service.

create table public.push_tickets (
  ticket_id text primary key,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  -- Which device it went to, to delete a token Expo reports as unregistered.
  token text not null,
  created_at timestamptz not null default now(),
  check_after timestamptz not null default now() + interval '15 minutes',
  claimed_at timestamptz,
  status text not null default 'pending',
  -- Expo's error code only, never message text.
  error text,
  checked_at timestamptz,
  constraint push_tickets_status_valid check (status in ('pending', 'error')),
  constraint push_tickets_error_valid check ((status = 'error') = (error is not null)),
  constraint push_tickets_id_valid check (char_length(ticket_id) between 1 and 200)
);

create index push_tickets_due on public.push_tickets (check_after) where status = 'pending';
create index push_tickets_notification on public.push_tickets (notification_id);

comment on table public.push_tickets is
  'Expo tickets of accepted pushes, kept until their receipt is read. Rows with an error are for maintainers.';

-- Delivery data: no client reads or writes it.
alter table public.push_tickets enable row level security;
revoke all on table public.push_tickets from anon, authenticated;

-- As in 20261114104853_add_notifications.sql, and also keeps the ticket of
-- every push Expo accepted. p_results items may carry "ticket_id".
create or replace function private.report_pushes(p_results jsonb)
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

  insert into public.push_tickets (ticket_id, notification_id, token)
  select r.ticket_id, r.notification_id, r.token
  from jsonb_to_recordset(p_results) r (notification_id uuid, token text, ok boolean, ticket_id text)
  where r.ok and r.ticket_id is not null and char_length(r.ticket_id) between 1 and 200
    and exists (select 1 from public.notifications n where n.id = r.notification_id)
  on conflict (ticket_id) do nothing;

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

-- Takes up to p_limit tickets whose receipt is due (at most 1000, Expo's
-- limit per request), locked against concurrent runs. A claim never reported
-- is taken again after five minutes. Also tidies up: a ticket with no receipt
-- after a day can no longer be checked, and errors are kept for 30 days.
create function private.claim_push_receipts(p_limit integer)
returns table (ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_tickets t
  set status = 'error', error = 'NoReceipt', checked_at = now(), claimed_at = null
  where t.status = 'pending' and t.created_at < now() - interval '1 day';

  delete from public.push_tickets t
  where t.status = 'error' and t.checked_at < now() - interval '30 days';

  return query
  with due as (
    select t.ticket_id
    from public.push_tickets t
    where t.status = 'pending' and t.check_after <= now()
      and (t.claimed_at is null or t.claimed_at < now() - interval '5 minutes')
    order by t.check_after
    limit greatest(least(coalesce(p_limit, 1000), 1000), 1)
    for update skip locked
  )
  update public.push_tickets t
  set claimed_at = now()
  from due
  where t.ticket_id = due.ticket_id
  returning t.ticket_id;
end;
$$;

-- Records what Expo said about each claimed ticket. p_results:
--   [{"ticket_id", "status": "ok"}]
--   [{"ticket_id", "status": "error", "error": "DeviceNotRegistered" | ...}]
--   [{"ticket_id", "status": "missing"}]   no receipt yet, ask again later
create function private.report_push_receipts(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_results' using errcode = '22023';
  end if;

  -- One statement, so every outcome of a report is written together. Only
  -- tickets this run claimed are touched.
  with reported as (
    select t.ticket_id, t.token, r.status, left(coalesce(r.error, 'UnknownError'), 100) as error
    from jsonb_to_recordset(p_results) r (ticket_id text, status text, error text)
    join public.push_tickets t on t.ticket_id = r.ticket_id
    where t.status = 'pending' and t.claimed_at is not null
  ),
  gone_tokens as (
    delete from public.push_tokens p
    using reported r
    where r.status = 'error' and r.error = 'DeviceNotRegistered' and p.token = r.token
  ),
  delivered as (
    delete from public.push_tickets t
    using reported r
    where t.ticket_id = r.ticket_id and r.status = 'ok'
  ),
  failed as (
    update public.push_tickets t
    set status = 'error', error = r.error, checked_at = now(), claimed_at = null
    from reported r
    where t.ticket_id = r.ticket_id and r.status = 'error'
  )
  update public.push_tickets t
  set claimed_at = null, check_after = now() + interval '15 minutes'
  from reported r
  where t.ticket_id = r.ticket_id and r.status not in ('ok', 'error');
end;
$$;

revoke execute on function private.claim_push_receipts(integer) from public;
revoke execute on function private.report_push_receipts(jsonb) from public;
grant execute on function private.claim_push_receipts(integer) to service_role;
grant execute on function private.report_push_receipts(jsonb) to service_role;

create function public.claim_push_receipts(p_limit integer default 1000)
returns table (ticket_id text)
language sql
security invoker
set search_path = ''
as $$ select * from private.claim_push_receipts(p_limit) $$;

create function public.report_push_receipts(p_results jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.report_push_receipts(p_results) $$;

revoke execute on function public.claim_push_receipts(integer) from public, anon, authenticated;
revoke execute on function public.report_push_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.claim_push_receipts(integer) to service_role;
grant execute on function public.report_push_receipts(jsonb) to service_role;

-- As in 20261114104853_add_notifications.sql, and also runs when receipts are due.
create or replace function private.request_push_delivery()
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
  ) and not exists (
    select 1 from public.push_tickets t
    where t.status = 'pending' and t.check_after <= now()
      and (t.claimed_at is null or t.claimed_at < now() - interval '5 minutes')
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
