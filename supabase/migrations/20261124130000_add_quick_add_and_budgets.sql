-- Quick-add templates and budgets (SRS FR-10.3; task 2.8, decision 23).
--
-- Quick-add templates fill the Add expense form for a common expense. They
-- belong to the apartment: every current member sees them, and anyone who may
-- add expenses saves and deletes them. Using one still posts through
-- post_expense, so a template is never a financial record and can change or
-- go freely.
--
-- Budgets are monthly caps an admin sets for the apartment's whole spending
-- and for single categories. Spending is counted as in get_monthly_spending:
-- expenses dated in the calendar month, cancelled ones left out, bills not
-- paid yet included. Every current member is told the first time a month
-- reaches 80% and 100% of a cap.

-- Quick-add templates ---------------------------------------------------------------------

create table public.expense_templates (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  title text not null,
  -- Null when the amount differs each time, such as groceries.
  amount_minor bigint,
  category_id uuid references public.expense_categories (id) on delete set null,
  category_detail text,
  -- As for post_expense. Null participants: shared equally by everyone who
  -- is a member when the template is used, so newcomers are included.
  split_method text not null,
  participants jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_templates_title_valid check (char_length(title) between 1 and 100 and title = btrim(title)),
  constraint expense_templates_amount_valid check (
    amount_minor is null or (amount_minor > 0 and amount_minor <= 1000000000000)
  ),
  constraint expense_templates_category_detail_valid check (
    category_detail is null
    or (category_id is not null and char_length(category_detail) between 1 and 60
        and category_detail = btrim(category_detail))
  ),
  constraint expense_templates_split_valid check (
    split_method in ('equal', 'percentage', 'fixed')
    and (split_method <> 'fixed' or amount_minor is not null)
    and (participants is not null or split_method = 'equal')
  ),
  constraint expense_templates_participants_valid check (
    participants is null or jsonb_typeof(participants) = 'array'
  )
);

-- Saving a template under a name already used replaces that one.
create unique index expense_templates_title_unique on public.expense_templates (apartment_id, lower(title));

create trigger expense_templates_set_updated_at
before update on public.expense_templates
for each row
execute function private.set_updated_at();

alter table public.expense_templates enable row level security;
revoke all on table public.expense_templates from anon, authenticated;
grant select on table public.expense_templates to authenticated;

create policy "Members read their apartment's quick-add templates"
on public.expense_templates
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- A row of chips in the Add form stays usable.
create function private.max_expense_templates()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30 $$;

revoke execute on function private.max_expense_templates() from public;

-- The caller, when they may add expenses in the apartment; otherwise raises.
create function private.require_expense_author(p_apartment_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not exists (
    select 1 from public.apartment_members
    where apartment_id = p_apartment_id and user_id = me and left_at is null and can_add_expense
  ) then
    raise exception 'not_allowed_to_add_expense' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke execute on function private.require_expense_author(uuid) from public;

-- Saves a template, replacing one of the same name (ignoring case).
create function private.save_expense_template(
  p_apartment_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_category_id uuid,
  p_category_detail text,
  p_split_method text,
  p_participants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid := private.require_expense_author(p_apartment_id);
  clean_title text := btrim(coalesce(p_title, ''));
  clean_detail text := nullif(btrim(coalesce(p_category_detail, '')), '');
  existing uuid;
  saved uuid;
begin
  if char_length(clean_title) not between 1 and 100 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if p_amount_minor is not null and (p_amount_minor <= 0 or p_amount_minor > 1000000000000) then
    raise exception 'invalid_total' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.expense_categories
    where id = p_category_id and apartment_id = p_apartment_id and archived_at is null
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if clean_detail is not null and p_category_id is null then
    raise exception 'category_detail_without_category' using errcode = '22023';
  end if;
  if char_length(clean_detail) > 60 then
    raise exception 'category_detail_too_long' using errcode = '22023';
  end if;
  if p_split_method is null or p_split_method not in ('equal', 'percentage', 'fixed') then
    raise exception 'invalid_split_method' using errcode = '22023';
  end if;
  if p_split_method = 'fixed' and p_amount_minor is null then
    raise exception 'fixed_split_needs_fixed_amount' using errcode = '22023';
  end if;
  if p_participants is null then
    if p_split_method <> 'equal' then
      raise exception 'invalid_split' using errcode = '22023';
    end if;
  else
    -- Any total checks equal and percentage splits; fixed shares must add
    -- up to the amount.
    perform count(*) from private.compute_shares(coalesce(p_amount_minor, 10000), p_split_method, p_participants);
    perform private.require_current_members(p_apartment_id, p_participants, 'participant_not_member');
  end if;

  select id into existing from public.expense_templates
  where apartment_id = p_apartment_id and lower(title) = lower(clean_title)
  for update;

  if existing is null and (
    select count(*) from public.expense_templates where apartment_id = p_apartment_id
  ) >= private.max_expense_templates() then
    raise exception 'too_many_templates' using errcode = '22023';
  end if;

  insert into public.expense_templates (
    apartment_id, title, amount_minor, category_id, category_detail, split_method, participants, created_by
  )
  values (p_apartment_id, clean_title, p_amount_minor, p_category_id, clean_detail, p_split_method, p_participants, author)
  on conflict (apartment_id, lower(title)) do update
  set title = excluded.title,
      amount_minor = excluded.amount_minor,
      category_id = excluded.category_id,
      category_detail = excluded.category_detail,
      split_method = excluded.split_method,
      participants = excluded.participants
  returning id into saved;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, author, 'expense_template', saved,
          case when existing is null then 'created' else 'updated' end);

  return saved;
end;
$$;

revoke execute on function private.save_expense_template(uuid, text, bigint, uuid, text, text, jsonb) from public;
grant execute on function private.save_expense_template(uuid, text, bigint, uuid, text, text, jsonb) to authenticated;

create function private.delete_expense_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  template public.expense_templates;
  author uuid;
begin
  select * into template from public.expense_templates where id = p_template_id for update;
  if template.id is null or not private.is_active_member(template.apartment_id) then
    raise exception 'template_not_found' using errcode = 'P0002';
  end if;
  author := private.require_expense_author(template.apartment_id);

  delete from public.expense_templates where id = p_template_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (template.apartment_id, author, 'expense_template', p_template_id, 'deleted');
end;
$$;

revoke execute on function private.delete_expense_template(uuid) from public;
grant execute on function private.delete_expense_template(uuid) to authenticated;

create function public.save_expense_template(
  p_apartment_id uuid,
  p_title text,
  p_split_method text,
  p_amount_minor bigint default null,
  p_category_id uuid default null,
  p_category_detail text default null,
  p_participants jsonb default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_expense_template(
    p_apartment_id, p_title, p_amount_minor, p_category_id, p_category_detail, p_split_method, p_participants
  )
$$;

revoke execute on function public.save_expense_template(uuid, text, text, bigint, uuid, text, jsonb) from public, anon;
grant execute on function public.save_expense_template(uuid, text, text, bigint, uuid, text, jsonb) to authenticated;

create function public.delete_expense_template(p_template_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.delete_expense_template(p_template_id) $$;

revoke execute on function public.delete_expense_template(uuid) from public, anon;
grant execute on function public.delete_expense_template(uuid) to authenticated;

-- Budgets ---------------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  -- Null: all of the apartment's spending.
  category_id uuid references public.expense_categories (id) on delete cascade,
  -- Per calendar month, in the apartment's timezone.
  limit_minor bigint not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_limit_valid check (limit_minor > 0 and limit_minor <= 1000000000000),
  constraint budgets_once unique nulls not distinct (apartment_id, category_id)
);

create trigger budgets_set_updated_at
before update on public.budgets
for each row
execute function private.set_updated_at();

alter table public.budgets enable row level security;
revoke all on table public.budgets from anon, authenticated;
grant select on table public.budgets to authenticated;

create policy "Members read their apartment's budgets"
on public.budgets
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- The highest alert sent for a budget in a month, so each level goes out
-- once. Internal to the job; clients never read it.
create table public.budget_alerts (
  budget_id uuid not null references public.budgets (id) on delete cascade,
  month date not null,
  level smallint not null,
  primary key (budget_id, month),
  constraint budget_alerts_level_valid check (level in (80, 100))
);

alter table public.budget_alerts enable row level security;
revoke all on table public.budget_alerts from anon, authenticated;

-- Sets the monthly cap for the whole apartment (p_category_id null) or one
-- category. A changed cap starts its alerts afresh for the month.
create function private.set_budget(p_apartment_id uuid, p_category_id uuid, p_limit_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  before_limit bigint;
  saved uuid;
begin
  if p_limit_minor is null or p_limit_minor <= 0 or p_limit_minor > 1000000000000 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.expense_categories
    where id = p_category_id and apartment_id = p_apartment_id and archived_at is null
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  select id, limit_minor into saved, before_limit from public.budgets
  where apartment_id = p_apartment_id and category_id is not distinct from p_category_id
  for update;
  if before_limit = p_limit_minor then
    return saved;
  end if;

  insert into public.budgets (apartment_id, category_id, limit_minor, created_by)
  values (p_apartment_id, p_category_id, p_limit_minor, admin_id)
  on conflict (apartment_id, category_id) do update set limit_minor = excluded.limit_minor
  returning id into saved;

  delete from public.budget_alerts where budget_id = saved;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'budget', saved, 'set',
          jsonb_build_object('category_id', p_category_id, 'before', before_limit, 'after', p_limit_minor));
  return saved;
end;
$$;

revoke execute on function private.set_budget(uuid, uuid, bigint) from public;
grant execute on function private.set_budget(uuid, uuid, bigint) to authenticated;

create function private.remove_budget(p_apartment_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  removed public.budgets;
begin
  delete from public.budgets
  where apartment_id = p_apartment_id and category_id is not distinct from p_category_id
  returning * into removed;
  if removed.id is null then
    return;
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'budget', removed.id, 'removed',
          jsonb_build_object('category_id', p_category_id, 'before', removed.limit_minor));
end;
$$;

revoke execute on function private.remove_budget(uuid, uuid) from public;
grant execute on function private.remove_budget(uuid, uuid) to authenticated;

-- What counts against a budget in a month: the apartment's expenses dated in
-- it, not cancelled, in the budget's category when it has one.
create function private.budget_spent(p_apartment_id uuid, p_category_id uuid, p_month date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(x.amount_minor), 0)::bigint
  from public.expenses x
  where x.apartment_id = p_apartment_id
    and x.status <> 'void'
    and x.expense_date >= p_month
    and x.expense_date < (p_month + interval '1 month')::date
    and (p_category_id is null or x.category_id = p_category_id)
$$;

revoke execute on function private.budget_spent(uuid, uuid, date) from public;

-- Each budget with what was spent in the month that starts on p_month, the
-- whole apartment's first, then by category name. Budgets on archived
-- categories are left out.
create function private.get_budgets(p_apartment_id uuid, p_month date)
returns table (budget_id uuid, category_id uuid, limit_minor bigint, spent_minor bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'invalid_month' using errcode = '22023';
  end if;

  return query
  select b.id, b.category_id, b.limit_minor, private.budget_spent(p_apartment_id, b.category_id, p_month)
  from public.budgets b
  left join public.expense_categories c on c.id = b.category_id
  where b.apartment_id = p_apartment_id and (b.category_id is null or c.archived_at is null)
  order by b.category_id is not null, lower(c.name);
end;
$$;

revoke execute on function private.get_budgets(uuid, date) from public;
grant execute on function private.get_budgets(uuid, date) to authenticated;

create function public.set_budget(p_apartment_id uuid, p_limit_minor bigint, p_category_id uuid default null)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.set_budget(p_apartment_id, p_category_id, p_limit_minor) $$;

revoke execute on function public.set_budget(uuid, bigint, uuid) from public, anon;
grant execute on function public.set_budget(uuid, bigint, uuid) to authenticated;

create function public.remove_budget(p_apartment_id uuid, p_category_id uuid default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_budget(p_apartment_id, p_category_id) $$;

revoke execute on function public.remove_budget(uuid, uuid) from public, anon;
grant execute on function public.remove_budget(uuid, uuid) to authenticated;

create function public.get_budgets(p_apartment_id uuid, p_month date)
returns table (budget_id uuid, category_id uuid, limit_minor bigint, spent_minor bigint)
language sql
security invoker
set search_path = ''
as $$ select * from private.get_budgets(p_apartment_id, p_month) $$;

revoke execute on function public.get_budgets(uuid, date) from public, anon;
grant execute on function public.get_budgets(uuid, date) to authenticated;

-- Alerts ----------------------------------------------------------------------------------

alter table public.notification_mutes drop constraint notification_mutes_category_valid;
alter table public.notification_mutes add constraint notification_mutes_category_valid check (
  category in ('expenses', 'payments', 'disputes', 'members', 'reminders', 'settlement', 'budgets')
);

-- As in 20261124090000_add_notification_preferences.sql, with budgets.
create or replace function private.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'expense.dispute\_%' then 'disputes'
    when p_type like 'expense.%' or p_type like 'recurring\_bill.%' then 'expenses'
    when p_type like 'payment.%' or p_type like 'offset.%' or p_type like 'adjustment.%' then 'payments'
    when p_type like 'member.%' or p_type like 'join\_request.%' or p_type like 'rejoin\_invite.%' then 'members'
    when p_type like 'reminder.%' then 'reminders'
    when p_type like 'settlement\_period.%' then 'settlement'
    when p_type like 'budget.%' then 'budgets'
  end
$$;

-- As in 20261124090000_add_notification_preferences.sql, with budgets.
create or replace function private.set_notification_push(p_category text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  changed integer;
begin
  if p_category is null
     or p_category not in ('expenses', 'payments', 'disputes', 'members', 'reminders', 'settlement', 'budgets') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'invalid_enabled' using errcode = '22023';
  end if;

  if p_enabled then
    delete from public.notification_mutes where user_id = me and category = p_category;
  else
    insert into public.notification_mutes (user_id, category) values (me, p_category)
    on conflict do nothing;
  end if;
  get diagnostics changed = row_count;

  if changed > 0 then
    perform private.emit_change('user:' || me, 'notification_preference');
  end if;
end;
$$;

-- As in 20261124091000_add_reminders.sql, with the budget alerts.
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
    else 'Something changed in FlatMate.'
  end;
$$;

-- Tells every current member when this month's spending first reaches 80%
-- and 100% of a budget. A month that jumps past both sends only the second.
-- The level reached is kept per budget and month, and only ever rises, so a
-- job that runs twice, or twice at once, sends nothing twice. Returns how
-- many notifications it created.
create function private.send_budget_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  created integer;
begin
  with progress as (
    select b.id as budget_id, b.apartment_id, b.limit_minor, m.month,
      private.budget_spent(b.apartment_id, b.category_id, m.month) as spent
    from public.budgets b
    join public.apartments a on a.id = b.apartment_id
    left join public.expense_categories c on c.id = b.category_id
    cross join lateral (
      select date_trunc('month', (now() at time zone a.timezone)::date)::date as month
    ) m
    where b.category_id is null or c.archived_at is null
  ),
  reached as (
    select budget_id, apartment_id, month,
      case when spent >= limit_minor then 100 when spent * 5 >= limit_minor * 4 then 80 end as level
    from progress
  ),
  raised as (
    insert into public.budget_alerts (budget_id, month, level)
    select budget_id, month, level from reached where level is not null
    on conflict (budget_id, month) do update set level = excluded.level
    where public.budget_alerts.level < excluded.level
    returning budget_id, month, level
  ),
  inserted as (
    insert into public.notifications (user_id, apartment_id, type, record_type, record_id, reminder_key)
    select mem.user_id, r.apartment_id,
      case x.level when 100 then 'budget.over_limit' else 'budget.near_limit' end,
      'apartment', r.apartment_id,
      'budget:' || x.budget_id || ':' || x.month || ':' || x.level
    from raised x
    join reached r on r.budget_id = x.budget_id
    join public.apartment_members mem on mem.apartment_id = r.apartment_id and mem.left_at is null
    on conflict (user_id, reminder_key) where reminder_key is not null do nothing
    returning user_id
  )
  select array_agg(distinct user_id), count(*) into recipients, created from inserted;

  perform private.emit_change('user:' || person, 'notification')
  from unnest(coalesce(recipients, '{}')) person;
  return created;
end;
$$;

revoke execute on function private.send_budget_alerts() from public;

select cron.schedule('send-budget-alerts', '*/5 * * * *', $$ select private.send_budget_alerts() $$);
