-- Reminders (SRS FR-09.1, FR-09.2, FR-09.4; task 2.5).
--
-- Two reminders, both on a schedule an admin sets per apartment:
--
-- - A bill not paid yet, with a due date: its collector is reminded a set
--   number of days before, and again on the day. A bill without a collector,
--   or whose collector has left, reminds the apartment's admins instead.
-- - The settlement day: members who still owe someone in the apartment are
--   reminded a set number of days before it. Disputed amounts are on hold
--   and do not count; provisional ones do, since they are payable now.
--
-- Dates are the apartment's, and reminders go out from 09:00 there, never in
-- the night. Each reminder carries a key, unique per person, so a job that
-- runs twice, runs late or runs twice at once never sends one twice.

-- Schedule -------------------------------------------------------------------------------

-- Days before; null turns the reminder off. A due-date reminder of 0 days
-- comes only on the day.
alter table public.apartments
  add column due_reminder_days smallint default 1,
  add column settlement_reminder_days smallint default 2,
  add constraint apartments_due_reminder_days_valid check (due_reminder_days between 0 and 14),
  add constraint apartments_settlement_reminder_days_valid check (settlement_reminder_days between 1 and 14);

comment on column public.apartments.due_reminder_days is
  'Days before an unpaid bill''s due date to remind who pays it, as well as on the day. Null: off.';
comment on column public.apartments.settlement_reminder_days is
  'Days before the settlement day to remind members who owe. Null: off.';

create function private.update_apartment_reminders(
  p_apartment_id uuid,
  p_due_reminder_days integer,
  p_settlement_reminder_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  before_row public.apartments;
begin
  if p_due_reminder_days is not null and p_due_reminder_days not between 0 and 14 then
    raise exception 'invalid_due_reminder_days' using errcode = '22023';
  end if;
  if p_settlement_reminder_days is not null and p_settlement_reminder_days not between 1 and 14 then
    raise exception 'invalid_settlement_reminder_days' using errcode = '22023';
  end if;

  select * into before_row from public.apartments where id = p_apartment_id for update;
  if row(before_row.due_reminder_days, before_row.settlement_reminder_days)
     is not distinct from row(p_due_reminder_days::smallint, p_settlement_reminder_days::smallint) then
    return;
  end if;

  update public.apartments
  set due_reminder_days = p_due_reminder_days,
      settlement_reminder_days = p_settlement_reminder_days
  where id = p_apartment_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_apartment_id, admin_id, 'apartment', p_apartment_id, 'reminders_changed',
    jsonb_build_object(
      'before', jsonb_build_object('due_reminder_days', before_row.due_reminder_days,
                                   'settlement_reminder_days', before_row.settlement_reminder_days),
      'after', jsonb_build_object('due_reminder_days', p_due_reminder_days,
                                  'settlement_reminder_days', p_settlement_reminder_days)
    )
  );
end;
$$;

revoke execute on function private.update_apartment_reminders(uuid, integer, integer) from public;
grant execute on function private.update_apartment_reminders(uuid, integer, integer) to authenticated;

-- A reminder left out, or null, is turned off.
create function public.update_apartment_reminders(
  p_apartment_id uuid,
  p_due_reminder_days integer default null,
  p_settlement_reminder_days integer default null
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.update_apartment_reminders(p_apartment_id, p_due_reminder_days, p_settlement_reminder_days) $$;

revoke execute on function public.update_apartment_reminders(uuid, integer, integer) from public, anon;
grant execute on function public.update_apartment_reminders(uuid, integer, integer) to authenticated;

-- Notifications --------------------------------------------------------------------------

-- A reminder has no audit event. Its key says which reminder it is, and a
-- person gets each key once.
alter table public.notifications add column reminder_key text;

create unique index notifications_reminder_once on public.notifications (user_id, reminder_key)
where reminder_key is not null;

-- The unpaid bills that could need a reminder.
create index expenses_unpaid_due on public.expenses (due_date)
where paid_status = 'unpaid' and status <> 'void' and due_date is not null;

-- As in 20261116120100_add_repeatable_expenses.sql, with the reminders.
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
    else 'Something changed in FlatMate.'
  end;
$$;

-- The job ---------------------------------------------------------------------------------

-- The local time from which reminders go out.
create function private.reminder_time()
returns time
language sql
immutable
set search_path = ''
as $$ select time '09:00' $$;

revoke execute on function private.reminder_time() from public;

-- Creates every reminder that is due and not yet sent, and tells each
-- recipient's devices. A day the job missed is caught up later in the same
-- window, but a "due soon" reminder is never sent on or after the due date,
-- where the "due today" one takes over. Returns how many it created.
create function private.send_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  created integer;
begin
  with local_day as (
    select a.id as apartment_id, a.due_reminder_days, a.settlement_reminder_days,
      (now() at time zone a.timezone)::date as today
    from public.apartments a
    where (now() at time zone a.timezone)::time >= private.reminder_time()
      and (a.due_reminder_days is not null or a.settlement_reminder_days is not null)
  ),
  due_bills as (
    select x.id as expense_id, x.apartment_id, x.due_date, x.collector_id,
      case when d.today = x.due_date then 'reminder.bill_due_today' else 'reminder.bill_due_soon' end as type
    from public.expenses x
    join local_day d on d.apartment_id = x.apartment_id
    where x.paid_status = 'unpaid' and x.status <> 'void' and x.due_date is not null
      and d.due_reminder_days is not null
      and d.today between x.due_date - d.due_reminder_days and x.due_date
  ),
  bill_reminders as (
    -- The collector, while still a member.
    select b.collector_id as user_id, b.apartment_id, b.type, 'expense'::text as record_type,
      b.expense_id as record_id, b.type || ':' || b.expense_id || ':' || b.due_date as reminder_key
    from due_bills b
    where b.collector_id is not null and private.is_current_member_of(b.apartment_id, b.collector_id)
    union all
    -- Otherwise every admin, since one of them decides who pays.
    select m.user_id, b.apartment_id, b.type, 'expense', b.expense_id,
      b.type || ':' || b.expense_id || ':' || b.due_date
    from due_bills b
    join public.apartment_members m
      on m.apartment_id = b.apartment_id and m.left_at is null and m.role = 'admin'
    where b.collector_id is null or not private.is_current_member_of(b.apartment_id, b.collector_id)
  ),
  settling as (
    -- The open period ends the day before the settlement day.
    select p.id as period_id, p.apartment_id
    from public.settlement_periods p
    join local_day d on d.apartment_id = p.apartment_id
    where p.state = 'open' and d.settlement_reminder_days is not null
      and d.today between p.ends_on + 1 - d.settlement_reminder_days and p.ends_on
  ),
  pair_balances as (
    -- What each pair owes now, without disputed amounts. Positive: a owes b.
    select s.period_id, s.apartment_id,
      least(e.debtor_id, e.creditor_id) as a,
      greatest(e.debtor_id, e.creditor_id) as b,
      sum(
        (case when e.debtor_id < e.creditor_id then 1 else -1 end)
        * (case when e.kind in ('charge', 'adjustment') then 1 else -1 end)
        * e.amount_minor
      ) as amount
    from settling s
    join public.ledger_entries e on e.apartment_id = s.apartment_id
    left join public.expenses x on x.id = e.expense_id
    left join public.payments pm on pm.id = e.payment_id
    where private.entry_state(e.kind, x.status, pm.status) in ('final', 'provisional')
    group by s.period_id, s.apartment_id, least(e.debtor_id, e.creditor_id), greatest(e.debtor_id, e.creditor_id)
  ),
  settlement_reminders as (
    select distinct case when pb.amount > 0 then pb.a else pb.b end as user_id, pb.apartment_id,
      'reminder.settlement_soon'::text as type, 'settlement'::text as record_type,
      pb.period_id as record_id, 'reminder.settlement_soon:' || pb.period_id as reminder_key
    from pair_balances pb
    where pb.amount <> 0
      and private.is_current_member_of(pb.apartment_id, case when pb.amount > 0 then pb.a else pb.b end)
  ),
  inserted as (
    insert into public.notifications (user_id, apartment_id, type, record_type, record_id, reminder_key)
    select user_id, apartment_id, type, record_type, record_id, reminder_key from bill_reminders
    union all
    select user_id, apartment_id, type, record_type, record_id, reminder_key from settlement_reminders
    on conflict (user_id, reminder_key) where reminder_key is not null do nothing
    returning user_id
  )
  select array_agg(distinct user_id), count(*) into recipients, created from inserted;

  perform private.emit_change('user:' || person, 'notification')
  from unnest(coalesce(recipients, '{}')) person;
  return created;
end;
$$;

revoke execute on function private.send_due_reminders() from public;

-- Every 15 minutes, so reminders go out soon after 09:00 in each timezone.
select cron.schedule('send-reminders', '*/15 * * * *', $$ select private.send_due_reminders() $$);
