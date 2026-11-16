-- Repeatable expenses (SRS FR-04, AC-02, AC-05; tasks 2.1 to 2.3).
--
-- Admins set up a template in the apartment's settings: a title, how often it
-- repeats, when, how many days members have to pay it, who will pay the bill,
-- and how it is shared. It repeats every day, every 1 or 2 weeks from its
-- first date, or every 1, 3 or 12 months on a day of the month.
--
--   Fixed     A known amount, such as rent. On the bill day a scheduled job
--             adds it as an unpaid bill with the template's split.
--   Variable  An amount that changes, such as electricity. On the bill day the
--             job asks the admins for the real amount. No charge exists until
--             an admin enters it: the app never invents an amount.
--
-- Each template and billing period gets at most one instance, so a job that
-- runs twice, or two jobs at once, charges nothing twice (FR-04.6). A charge
-- is an ordinary unpaid bill: it has no creditor until a member pays it
-- (SRS section 12, item 5), it can be disputed, and an admin can edit one
-- month's charge through the usual versioned edit without changing the
-- template (FR-04.4). Template changes apply to charges not yet made
-- (FR-04.5).

-- Tables ---------------------------------------------------------------------------------

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  title text not null,
  kind text not null,
  -- Fixed templates only. A variable bill's amount is entered each time.
  amount_minor bigint,
  -- Every day, every 1 or 2 weeks, or every 1, 3 or 12 months.
  repeat_unit text not null,
  repeat_every integer not null,
  -- Monthly units only: the day of the month the bill arrives. 29 to 31 fall
  -- on the last day of shorter months. Daily and weekly bills repeat from
  -- their first date, so a weekly one keeps that date's weekday.
  bill_day integer,
  -- The charge is due this many days after the bill day; null for no due date.
  due_after_days integer,
  -- Who will pay the bill (decision 16): named on each charge, which notifies them.
  collector_id uuid references public.profiles (id) on delete set null,
  -- As for post_expense: "equal", "percentage" (basis_points) or "fixed"
  -- (amount_minor, fixed templates only), validated by private.compute_shares.
  split_method text not null,
  participants jsonb not null,
  -- The next bill date to charge. Moves forward as charges are made, so
  -- editing a template only affects later charges.
  next_bill_date date not null,
  paused_at timestamptz,
  -- Archived, never deleted: its charges keep pointing at it.
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set by the app so that a retried request cannot create a second template.
  client_request_id uuid,
  constraint recurring_templates_title_valid check (char_length(title) between 1 and 100 and title = btrim(title)),
  constraint recurring_templates_kind_valid check (kind in ('fixed', 'variable')),
  constraint recurring_templates_amount_valid check (
    (kind = 'fixed' and amount_minor > 0 and amount_minor <= 1000000000000)
    or (kind = 'variable' and amount_minor is null)
  ),
  constraint recurring_templates_repeat_valid check (
    (repeat_unit, repeat_every) in (('day', 1), ('week', 1), ('week', 2), ('month', 1), ('month', 3), ('month', 12))
  ),
  constraint recurring_templates_bill_day_valid check (
    (repeat_unit = 'month' and bill_day between 1 and 31) or (repeat_unit <> 'month' and bill_day is null)
  ),
  constraint recurring_templates_due_valid check (due_after_days is null or due_after_days between 0 and 90),
  constraint recurring_templates_split_valid check (
    split_method in ('equal', 'percentage', 'fixed') and (kind = 'fixed' or split_method <> 'fixed')
  ),
  constraint recurring_templates_participants_valid check (jsonb_typeof(participants) = 'array'),
  constraint recurring_templates_request_unique unique (apartment_id, client_request_id)
);

create index recurring_templates_apartment on public.recurring_templates (apartment_id, created_at)
where archived_at is null;
create index recurring_templates_due on public.recurring_templates (next_bill_date)
where paused_at is null and archived_at is null;

create trigger recurring_templates_set_updated_at
before update on public.recurring_templates
for each row
execute function private.set_updated_at();

-- One row per template and billing period.
--   waiting  An admin must act: enter a variable amount, or, for a fixed
--            template whose split names someone who has left, confirm the split.
--   posted   The charge exists (expense_id).
--   skipped  An admin decided there is no charge this period.
create table public.recurring_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_templates (id) on delete restrict,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  -- What makes a charge unique: the month for monthly units, so a changed
  -- bill day cannot charge a month twice, and the bill date otherwise.
  billing_period date not null,
  bill_date date not null,
  state text not null,
  reason text,
  expense_id uuid unique references public.expenses (id) on delete restrict,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recurring_instances_once_per_period unique (template_id, billing_period),
  constraint recurring_instances_state_valid check (state in ('waiting', 'posted', 'skipped')),
  constraint recurring_instances_reason_valid check (
    (state = 'waiting' and reason in ('amount_needed', 'split_needs_review'))
    or (state <> 'waiting' and reason is null)
  ),
  constraint recurring_instances_expense_valid check ((state = 'posted') = (expense_id is not null))
);

create index recurring_instances_waiting on public.recurring_instances (apartment_id, bill_date)
where state = 'waiting';

-- Access ---------------------------------------------------------------------------------

-- Only admins manage repeatable expenses (FR-04.1), so only they read them.
-- Members see each charge as an ordinary expense. All writes go through the
-- functions below.
alter table public.recurring_templates enable row level security;
alter table public.recurring_instances enable row level security;

revoke all on table public.recurring_templates, public.recurring_instances from anon, authenticated;
grant select on table public.recurring_templates, public.recurring_instances to authenticated;

create policy "Admins read their apartment's repeatable expenses"
on public.recurring_templates
for select
to authenticated
using ((select private.is_apartment_admin(apartment_id)));

create policy "Admins read their apartment's repeatable bills"
on public.recurring_instances
for select
to authenticated
using ((select private.is_apartment_admin(apartment_id)));

-- Dates ----------------------------------------------------------------------------------

-- The bill date in a billing period: the bill day, or the last day of a
-- shorter month.
create function private.period_bill_date(p_period date, p_bill_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_period) + make_interval(days => least(
    p_bill_day,
    extract(day from date_trunc('month', p_period) + interval '1 month - 1 day')::integer
  ) - 1))::date;
$$;

-- Today where the apartment is.
create function private.apartment_today(p_apartment_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone a.timezone)::date from public.apartments a where a.id = p_apartment_id;
$$;

-- The bill date after p_date: the bill day in a later month, or a number of
-- days or weeks on.
create function private.following_bill_date(p_date date, p_unit text, p_every integer, p_bill_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_unit
    when 'month' then private.period_bill_date(
      (date_trunc('month', p_date) + make_interval(months => p_every))::date, p_bill_day)
    when 'week' then p_date + 7 * p_every
    else p_date + p_every
  end;
$$;

-- The unique key of a charge on p_date (see recurring_instances.billing_period).
create function private.billing_period_of(p_date date, p_unit text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when p_unit = 'month' then date_trunc('month', p_date)::date else p_date end;
$$;

revoke execute on function private.period_bill_date(date, integer) from public;
revoke execute on function private.following_bill_date(date, text, integer, integer) from public;
revoke execute on function private.billing_period_of(date, text) from public;
revoke execute on function private.apartment_today(uuid) from public;

-- Validation -----------------------------------------------------------------------------

-- Checks a template's fields, raising the first problem found.
create function private.require_valid_template(
  p_apartment_id uuid,
  p_title text,
  p_kind text,
  p_amount_minor bigint,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_due_after_days integer,
  p_split_method text,
  p_participants jsonb,
  p_collector_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('fixed', 'variable') then
    raise exception 'invalid_recurring_kind' using errcode = '22023';
  end if;
  if p_kind = 'fixed' and (p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000) then
    raise exception 'invalid_total' using errcode = '22023';
  end if;
  if p_kind = 'variable' and p_amount_minor is not null then
    raise exception 'variable_amount_not_allowed' using errcode = '22023';
  end if;
  if (p_repeat_unit, p_repeat_every) is null
     or (p_repeat_unit, p_repeat_every) not in (('day', 1), ('week', 1), ('week', 2), ('month', 1), ('month', 3), ('month', 12)) then
    raise exception 'invalid_interval' using errcode = '22023';
  end if;
  if p_repeat_unit = 'month' and (p_bill_day is null or p_bill_day not between 1 and 31) then
    raise exception 'invalid_bill_day' using errcode = '22023';
  end if;
  if p_repeat_unit <> 'month' and p_bill_day is not null then
    raise exception 'bill_day_for_monthly_only' using errcode = '22023';
  end if;
  if p_due_after_days is not null and p_due_after_days not between 0 and 90 then
    raise exception 'invalid_due_after_days' using errcode = '22023';
  end if;
  -- A variable bill's total is unknown, so fixed shares cannot be set ahead.
  if p_kind = 'variable' and p_split_method = 'fixed' then
    raise exception 'fixed_split_needs_fixed_amount' using errcode = '22023';
  end if;
  -- Any total checks equal and percentage splits; fixed shares must add up
  -- to the template's amount.
  perform count(*) from private.compute_shares(coalesce(p_amount_minor, 10000), p_split_method, p_participants);
  perform private.require_current_members(p_apartment_id, p_participants, 'participant_not_member');
  if p_collector_id is not null and not private.is_current_member_of(p_apartment_id, p_collector_id) then
    raise exception 'collector_not_member' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.require_valid_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid)
from public;

-- Charging -------------------------------------------------------------------------------

-- Adds one period's charge as an unpaid bill and marks the instance posted.
-- Callers validate the split and lock the instance. p_actor is the admin who
-- entered it, or null when the scheduled job did; the charge is credited to
-- the template's author as the person who added it.
create function private.post_recurring_charge(
  p_instance_id uuid,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_due_date date,
  p_collector_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instance public.recurring_instances;
  template public.recurring_templates;
  apartment public.apartments;
  charge_date date;
  new_expense uuid;
begin
  select * into instance from public.recurring_instances where id = p_instance_id;
  select * into template from public.recurring_templates where id = instance.template_id;
  select * into apartment from public.apartments where id = instance.apartment_id;

  -- A charge late enough to fall in a closed period goes in today's instead;
  -- closed history never changes.
  charge_date := instance.bill_date;
  if private.in_closed_period(apartment.id, charge_date) then
    charge_date := private.apartment_today(apartment.id);
  end if;

  insert into public.expenses (
    apartment_id, title, amount_minor, currency, expense_date, due_date,
    paid_status, finalize_after, created_by, collector_id
  )
  values (
    apartment.id, template.title, p_amount_minor, apartment.currency, charge_date,
    case when p_due_date is not null then greatest(p_due_date, charge_date) end,
    'unpaid', now() + make_interval(days => apartment.approval_days), template.created_by, p_collector_id
  )
  returning id into new_expense;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by)
  values (new_expense, 1, p_amount_minor, p_split_method, coalesce(p_actor, template.created_by));

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
  select new_expense, 1, share.user_id, share.amount_minor,
    case when p_split_method = 'percentage' then (
      select (p ->> 'basis_points')::integer from jsonb_array_elements(p_participants) p
      where (p ->> 'user_id')::uuid = share.user_id
    ) end
  from private.compute_shares(p_amount_minor, p_split_method, p_participants) share;

  update public.recurring_instances
  set state = 'posted', reason = null, expense_id = new_expense, decided_by = p_actor, decided_at = now()
  where id = instance.id;

  -- One statement, so the apartment gets one change event for each kind.
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  select apartment.id, p_actor, row.entity_type, row.entity_id, row.action, row.details
  from (values
    ('expense', new_expense, 'created',
     jsonb_build_object('amount_minor', p_amount_minor, 'paid', false, 'revision', 1,
                        'recurring_instance_id', instance.id), true),
    ('expense', new_expense, 'collector_set', jsonb_build_object('collector_id', p_collector_id),
     p_collector_id is not null),
    ('recurring_bill', instance.id, 'posted', jsonb_build_object('expense_id', new_expense), true)
  ) as row(entity_type, entity_id, action, details, wanted)
  where row.wanted;

  return new_expense;
end;
$$;

revoke execute on function private.post_recurring_charge(uuid, bigint, text, jsonb, date, uuid, uuid) from public;

-- Charges one template's next bill date and moves it on to the following one.
-- A fixed template whose split still holds is charged at once; anything else
-- waits for an admin, who is notified. The caller locks the template.
create function private.charge_next_period(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.recurring_templates;
  bill_date date;
  instance_id uuid;
  split_holds boolean;
begin
  select * into template from public.recurring_templates where id = p_template_id;
  bill_date := template.next_bill_date;

  insert into public.recurring_instances (template_id, apartment_id, billing_period, bill_date, state, reason)
  values (
    template.id, template.apartment_id, private.billing_period_of(bill_date, template.repeat_unit),
    bill_date, 'waiting',
    case template.kind when 'fixed' then 'split_needs_review' else 'amount_needed' end
  )
  on conflict (template_id, billing_period) do nothing
  returning id into instance_id;

  update public.recurring_templates
  set next_bill_date = private.following_bill_date(
    bill_date, template.repeat_unit, template.repeat_every, template.bill_day)
  where id = template.id;

  -- Already charged by an earlier run.
  if instance_id is null then
    return;
  end if;

  split_holds := not exists (
    select 1 from jsonb_array_elements(template.participants) p
    where not private.is_current_member_of(template.apartment_id, (p ->> 'user_id')::uuid)
  );

  if template.kind = 'fixed' and split_holds then
    perform private.post_recurring_charge(
      instance_id, template.amount_minor, template.split_method, template.participants,
      bill_date + template.due_after_days,
      -- A collector who has left is simply not named.
      case when template.collector_id is not null
                and private.is_current_member_of(template.apartment_id, template.collector_id)
           then template.collector_id end,
      null
    );
  else
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
    values (
      template.apartment_id, null, 'recurring_bill', instance_id,
      case template.kind when 'fixed' then 'needs_review' else 'amount_needed' end,
      jsonb_build_object('template_id', template.id)
    );
  end if;
end;
$$;

revoke execute on function private.charge_next_period(uuid) from public;

-- Charges every template whose bill day has come in its apartment's
-- timezone. A template that missed several charges, because the job was
-- down, catches up one charge per pass, and a daily one finishes on later runs. Rows another run holds are left for
-- the next one. Returns how many periods it charged or opened.
create function private.charge_due_recurring()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_id uuid;
  charged integer := 0;
  pass integer;
begin
  for pass in 1..12 loop
    for due_id in
      select t.id
      from public.recurring_templates t
      join public.apartments a on a.id = t.apartment_id
      where t.paused_at is null and t.archived_at is null
        and t.next_bill_date <= (now() at time zone a.timezone)::date
      order by t.next_bill_date
      limit 500
      for update of t skip locked
    loop
      perform private.charge_next_period(due_id);
      charged := charged + 1;
    end loop;
    exit when not found;
  end loop;
  return charged;
end;
$$;

revoke execute on function private.charge_due_recurring() from public;

-- Every 15 minutes, so a charge appears soon after local midnight on its day.
select cron.schedule('charge-repeatable-expenses', '*/15 * * * *', $$ select private.charge_due_recurring() $$);

-- Managing templates ---------------------------------------------------------------------

-- p_first_date is the first bill date, today or later. A monthly one is a bill
-- day within the next year, and may be this month's even if it has passed,
-- which charges it at once. Left out, it is the next bill day still to come
-- for a monthly template, and today otherwise.
create function private.create_recurring_template(
  p_apartment_id uuid,
  p_title text,
  p_kind text,
  p_amount_minor bigint,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_due_after_days integer,
  p_split_method text,
  p_participants jsonb,
  p_collector_id uuid,
  p_first_date date,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  today date := private.apartment_today(p_apartment_id);
  this_month date := date_trunc('month', today)::date;
  first_date date := p_first_date;
  existing uuid;
  new_template uuid;
begin
  if p_client_request_id is not null then
    select id into existing from public.recurring_templates
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  perform private.require_valid_template(
    p_apartment_id, p_title, p_kind, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day,
    p_due_after_days, p_split_method, p_participants, p_collector_id
  );

  if p_repeat_unit = 'month' then
    if first_date is null then
      first_date := private.period_bill_date(this_month, p_bill_day);
      if first_date < today then
        first_date := private.following_bill_date(first_date, 'month', 1, p_bill_day);
      end if;
    elsif first_date <> private.period_bill_date(first_date, p_bill_day)
          or first_date < this_month or first_date >= (this_month + interval '13 months')::date then
      raise exception 'invalid_first_date' using errcode = '22023';
    end if;
  else
    first_date := coalesce(first_date, today);
    if first_date < today or first_date > (today + interval '1 year')::date then
      raise exception 'invalid_first_date' using errcode = '22023';
    end if;
  end if;

  insert into public.recurring_templates (
    apartment_id, title, kind, amount_minor, repeat_unit, repeat_every, bill_day, due_after_days,
    collector_id, split_method, participants, next_bill_date, created_by, client_request_id
  )
  values (
    p_apartment_id, btrim(p_title), p_kind, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day,
    p_due_after_days, p_collector_id, p_split_method, p_participants, first_date, admin_id,
    p_client_request_id
  )
  returning id into new_template;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'recurring_template', new_template, 'created',
          jsonb_build_object('kind', p_kind, 'first_date', first_date));

  return new_template;
end;
$$;

-- Changes apply from the next charge not yet made (FR-04.5). Charges already
-- made, and bills waiting for an amount, are left as they are. The next charge
-- keeps its date, except that a monthly one moves to the new bill day in its
-- month, or the month after if that day has passed.
create function private.update_recurring_template(
  p_template_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_due_after_days integer,
  p_split_method text,
  p_participants jsonb,
  p_collector_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.recurring_templates;
  admin_id uuid;
  today date;
  next_date date;
begin
  select * into template from public.recurring_templates where id = p_template_id for update;
  if template.id is null or not private.is_apartment_admin(template.apartment_id) then
    raise exception 'recurring_template_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(template.apartment_id);
  if template.archived_at is not null then
    raise exception 'recurring_template_archived' using errcode = 'P0001';
  end if;

  -- The kind stays as created: a fixed rent does not become a variable bill.
  perform private.require_valid_template(
    template.apartment_id, p_title, template.kind, p_amount_minor, p_repeat_unit, p_repeat_every,
    p_bill_day, p_due_after_days, p_split_method, p_participants, p_collector_id
  );

  next_date := template.next_bill_date;
  if p_repeat_unit = 'month' then
    next_date := private.period_bill_date(next_date, p_bill_day);
    -- A paused template catches up when it resumes.
    if template.paused_at is null then
      today := private.apartment_today(template.apartment_id);
      while next_date < today loop
        next_date := private.following_bill_date(next_date, 'month', 1, p_bill_day);
      end loop;
    end if;
  end if;

  update public.recurring_templates
  set title = btrim(p_title),
      amount_minor = p_amount_minor,
      repeat_unit = p_repeat_unit,
      repeat_every = p_repeat_every,
      bill_day = p_bill_day,
      next_bill_date = next_date,
      due_after_days = p_due_after_days,
      split_method = p_split_method,
      participants = p_participants,
      collector_id = p_collector_id
  where id = template.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (template.apartment_id, admin_id, 'recurring_template', template.id, 'edited',
          jsonb_build_object('from_date', next_date));
end;
$$;

-- Pausing stops new charges. Resuming starts again from the next bill day
-- still to come, so the months it was paused are not charged afterwards.
create function private.set_recurring_template_paused(p_template_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.recurring_templates;
  admin_id uuid;
  today date;
  resume_date date;
begin
  select * into template from public.recurring_templates where id = p_template_id for update;
  if template.id is null or not private.is_apartment_admin(template.apartment_id) then
    raise exception 'recurring_template_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(template.apartment_id);
  if template.archived_at is not null then
    raise exception 'recurring_template_archived' using errcode = 'P0001';
  end if;
  if (template.paused_at is not null) = coalesce(p_paused, false) then
    return;
  end if;

  resume_date := template.next_bill_date;
  if not p_paused then
    today := private.apartment_today(template.apartment_id);
    while resume_date < today loop
      resume_date := private.following_bill_date(
        resume_date, template.repeat_unit, template.repeat_every, template.bill_day);
    end loop;
  end if;

  update public.recurring_templates
  set paused_at = case when p_paused then now() end,
      next_bill_date = resume_date
  where id = template.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (template.apartment_id, admin_id, 'recurring_template', template.id,
          case when p_paused then 'paused' else 'resumed' end);
end;
$$;

-- Stops the template for good. Its charges stay, and a bill still waiting for
-- an amount can still be entered or skipped.
create function private.archive_recurring_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.recurring_templates;
  admin_id uuid;
begin
  select * into template from public.recurring_templates where id = p_template_id for update;
  if template.id is null or not private.is_apartment_admin(template.apartment_id) then
    raise exception 'recurring_template_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(template.apartment_id);
  if template.archived_at is not null then
    return;
  end if;

  update public.recurring_templates set archived_at = now() where id = template.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (template.apartment_id, admin_id, 'recurring_template', template.id, 'archived');
end;
$$;

-- Bills waiting for an admin -------------------------------------------------------------

-- Enters a waiting bill: the real amount for a variable bill, or a checked
-- split for a fixed one. The split given applies to this period only
-- (FR-04.4). Proof is added afterwards as a receipt on the charge. A retried
-- call returns the charge the first one made.
create function private.post_recurring_bill(
  p_instance_id uuid,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_due_date date,
  p_collector_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instance public.recurring_instances;
  admin_id uuid;
begin
  select * into instance from public.recurring_instances where id = p_instance_id for update;
  if instance.id is null or not private.is_apartment_admin(instance.apartment_id) then
    raise exception 'recurring_bill_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(instance.apartment_id);
  if instance.state = 'posted' then
    return instance.expense_id;
  end if;
  if instance.state <> 'waiting' then
    raise exception 'recurring_bill_not_waiting' using errcode = 'P0001';
  end if;

  perform count(*) from private.compute_shares(p_amount_minor, p_split_method, p_participants);
  perform private.require_current_members(instance.apartment_id, p_participants, 'participant_not_member');
  if p_collector_id is not null and not private.is_current_member_of(instance.apartment_id, p_collector_id) then
    raise exception 'collector_not_member' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < instance.bill_date then
    raise exception 'due_date_before_expense_date' using errcode = '22023';
  end if;

  return private.post_recurring_charge(
    instance.id, p_amount_minor, p_split_method, p_participants, p_due_date, p_collector_id, admin_id
  );
end;
$$;

-- No charge this period, such as a month without a bill.
create function private.skip_recurring_bill(p_instance_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  instance public.recurring_instances;
  admin_id uuid;
begin
  select * into instance from public.recurring_instances where id = p_instance_id for update;
  if instance.id is null or not private.is_apartment_admin(instance.apartment_id) then
    raise exception 'recurring_bill_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(instance.apartment_id);
  if instance.state = 'skipped' then
    return;
  end if;
  if instance.state <> 'waiting' then
    raise exception 'recurring_bill_not_waiting' using errcode = 'P0001';
  end if;

  update public.recurring_instances
  set state = 'skipped', reason = null, decided_by = admin_id, decided_at = now()
  where id = instance.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (instance.apartment_id, admin_id, 'recurring_bill', instance.id, 'skipped');
end;
$$;

revoke execute on function private.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid) from public;
revoke execute on function private.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid) from public;
revoke execute on function private.set_recurring_template_paused(uuid, boolean) from public;
revoke execute on function private.archive_recurring_template(uuid) from public;
revoke execute on function private.post_recurring_bill(uuid, bigint, text, jsonb, date, uuid) from public;
revoke execute on function private.skip_recurring_bill(uuid) from public;
grant execute on function private.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid) to authenticated;
grant execute on function private.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid) to authenticated;
grant execute on function private.set_recurring_template_paused(uuid, boolean) to authenticated;
grant execute on function private.archive_recurring_template(uuid) to authenticated;
grant execute on function private.post_recurring_bill(uuid, bigint, text, jsonb, date, uuid) to authenticated;
grant execute on function private.skip_recurring_bill(uuid) to authenticated;

-- Public wrappers ------------------------------------------------------------------------

create function public.create_recurring_template(
  p_apartment_id uuid,
  p_title text,
  p_kind text,
  p_amount_minor bigint,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_due_after_days integer,
  p_split_method text,
  p_participants jsonb,
  p_collector_id uuid default null,
  p_first_date date default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_recurring_template(
    p_apartment_id, p_title, p_kind, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day,
    p_due_after_days, p_split_method, p_participants, p_collector_id, p_first_date, p_client_request_id
  );
$$;

create function public.update_recurring_template(
  p_template_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_due_after_days integer,
  p_split_method text,
  p_participants jsonb,
  p_collector_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_recurring_template(
    p_template_id, p_title, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day, p_due_after_days,
    p_split_method, p_participants, p_collector_id
  );
$$;

create function public.set_recurring_template_paused(p_template_id uuid, p_paused boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_recurring_template_paused(p_template_id, p_paused) $$;

create function public.archive_recurring_template(p_template_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.archive_recurring_template(p_template_id) $$;

create function public.post_recurring_bill(
  p_instance_id uuid,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_due_date date default null,
  p_collector_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.post_recurring_bill(
    p_instance_id, p_amount_minor, p_split_method, p_participants, p_due_date, p_collector_id
  );
$$;

create function public.skip_recurring_bill(p_instance_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.skip_recurring_bill(p_instance_id) $$;

revoke execute on function public.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid) from public, anon;
revoke execute on function public.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid) from public, anon;
revoke execute on function public.set_recurring_template_paused(uuid, boolean) from public, anon;
revoke execute on function public.archive_recurring_template(uuid) from public, anon;
revoke execute on function public.post_recurring_bill(uuid, bigint, text, jsonb, date, uuid) from public, anon;
revoke execute on function public.skip_recurring_bill(uuid) from public, anon;
grant execute on function public.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid) to authenticated;
grant execute on function public.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid) to authenticated;
grant execute on function public.set_recurring_template_paused(uuid, boolean) to authenticated;
grant execute on function public.archive_recurring_template(uuid) to authenticated;
grant execute on function public.post_recurring_bill(uuid, bigint, text, jsonb, date, uuid) to authenticated;
grant execute on function public.skip_recurring_bill(uuid) to authenticated;

-- Notifications --------------------------------------------------------------------------

-- A waiting bill leads to the apartment's repeatable expenses.
alter table public.notifications drop constraint notifications_record_type_valid;
alter table public.notifications add constraint notifications_record_type_valid check (
  record_type in ('expense', 'dispute', 'payment', 'ledger', 'members', 'settlement', 'apartment',
                  'join_request', 'rejoin_invite', 'recurring')
);

-- As in 20261115090000_add_rejoin_invites_and_hidden_former_members.sql, with
-- the recurring_bill branch at the end: every admin can enter the bill, and
-- the first to act decides.
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

  elsif kind in ('recurring_bill.amount_needed', 'recurring_bill.needs_review') then
    return query
    select m.user_id, kind, 'recurring'::text, e.apartment_id
    from public.apartment_members m
    where m.apartment_id = e.apartment_id and m.left_at is null and m.role = 'admin';
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
    when 'recurring_bill.amount_needed' then 'A repeatable bill arrived. Enter its amount.'
    when 'recurring_bill.needs_review' then 'A repeatable expense needs its split checked.'
    else 'Something changed in FlatMate.'
  end;
$$;
