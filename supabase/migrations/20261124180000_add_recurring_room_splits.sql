-- Repeatable expenses split by room (SRS FR-10.6, FR-04; task 3.3.2, decision 28).
--
-- A repeatable expense can be split by room each time it is charged, by the
-- rule of get_room_split (20261124170000_add_rooms_and_occupancy.sql). Its
-- room_period says which days a charge covers:
--
--   advance  From the bill date to the day before the next one, like rent.
--   arrears  From the previous bill date to the day before this one, like
--            electricity.
--
-- On the bill day the job charges a fixed amount split by room at once,
-- unless the split would leave out the days of someone who has left, or
-- nobody lived in a room during the period: then the charge waits for an
-- admin, as it does when a fixed split names someone who has left. A
-- variable bill waits for its amount as before; when an admin enters it with
-- the split by room, the server splits it while posting. Either way the
-- charge is an ordinary expense with a split by amount, and its notes say
-- which days the split covers.

-- Templates --------------------------------------------------------------------------------

alter table public.recurring_templates drop constraint recurring_templates_split_valid;
alter table public.recurring_templates
  add column room_period text,
  add constraint recurring_templates_split_valid check (
    split_method in ('equal', 'percentage', 'fixed', 'room') and (kind = 'fixed' or split_method <> 'fixed')
  ),
  add constraint recurring_templates_room_period_valid check (
    (split_method = 'room' and room_period in ('advance', 'arrears'))
    or (split_method <> 'room' and room_period is null)
  );

comment on column public.recurring_templates.room_period is
  'For a split by room: advance (the bill date to the day before the next) or arrears (the previous bill date to the day before this one).';

-- The split by room, for internal callers ---------------------------------------------------

-- get_room_split's arithmetic without its membership check, for the job and
-- for posting a bill. The checks on the amount and period stay here.
create function private.room_split(p_apartment_id uuid, p_amount_minor bigint, p_from date, p_to date)
returns table (user_id uuid, amount_minor bigint, days integer, included boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000 then
    raise exception 'invalid_total' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_to - p_from >= 366 then
    raise exception 'period_too_long' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.room_occupancies o
    where o.apartment_id = p_apartment_id
      and o.starts_on <= p_to and (o.ends_on is null or o.ends_on >= p_from)
      and private.is_current_member_of(p_apartment_id, o.user_id)
  ) then
    raise exception 'no_occupants' using errcode = '22023';
  end if;

  return query
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  lived as (
    select o.room_id, o.user_id, r.weight, d.day
    from days d
    join public.room_occupancies o
      on o.apartment_id = p_apartment_id and d.day >= o.starts_on and (o.ends_on is null or d.day <= o.ends_on)
    join public.rooms r on r.id = o.room_id
    where private.is_current_member_of(p_apartment_id, o.user_id)
  ),
  room_days as (
    select l.room_id, l.day, l.weight, count(*) as people from lived l group by l.room_id, l.day, l.weight
  ),
  day_weights as (
    select rd.day, sum(rd.weight) as weight from room_days rd group by rd.day
  ),
  parts as (
    select l.user_id, sum(l.weight::numeric / (dw.weight * rd.people)) as part, count(*)::integer as days
    from lived l
    join room_days rd on rd.room_id = l.room_id and rd.day = l.day
    join day_weights dw on dw.day = l.day
    group by l.user_id
  ),
  exact as (
    select pt.user_id, pt.days, p_amount_minor * pt.part / sum(pt.part) over () as amount
    from parts pt
  ),
  ranked as (
    select ex.user_id, ex.days, floor(ex.amount)::bigint as base,
      row_number() over (order by ex.amount - floor(ex.amount) desc, ex.user_id) as rank,
      p_amount_minor - sum(floor(ex.amount)) over () as units
    from exact ex
  )
  select rk.user_id, rk.base + case when rk.rank <= rk.units then 1 else 0 end, rk.days, true
  from ranked rk
  union all
  select o.user_id, 0::bigint,
    sum(least(coalesce(o.ends_on, p_to), p_to) - greatest(o.starts_on, p_from) + 1)::integer, false
  from public.room_occupancies o
  where o.apartment_id = p_apartment_id
    and o.starts_on <= p_to and (o.ends_on is null or o.ends_on >= p_from)
    and not private.is_current_member_of(p_apartment_id, o.user_id)
  group by o.user_id
  order by 4 desc, 1;
end;
$$;

revoke execute on function private.room_split(uuid, bigint, date, date) from public;

-- As in 20261124170000_add_rooms_and_occupancy.sql, now sharing its arithmetic.
create or replace function public.get_room_split(
  p_apartment_id uuid,
  p_amount_minor bigint,
  p_from date,
  p_to date
)
returns table (user_id uuid, amount_minor bigint, days integer, included boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  return query select * from private.room_split(p_apartment_id, p_amount_minor, p_from, p_to);
end;
$$;

-- The days a charge on p_bill_date covers, as described at the top.
create function private.recurring_room_period(
  p_bill_date date,
  p_repeat_unit text,
  p_repeat_every integer,
  p_bill_day integer,
  p_room_period text
)
returns table (starts_on date, ends_on date)
language sql
immutable
set search_path = ''
as $$
  select
    case when p_room_period = 'arrears' then
      case p_repeat_unit
        when 'month' then private.period_bill_date(
          (date_trunc('month', p_bill_date) - make_interval(months => p_repeat_every))::date, p_bill_day)
        when 'week' then p_bill_date - 7 * p_repeat_every
        else p_bill_date - p_repeat_every
      end
    else p_bill_date end,
    case when p_room_period = 'arrears' then p_bill_date - 1
    else private.following_bill_date(p_bill_date, p_repeat_unit, p_repeat_every, p_bill_day) - 1 end
$$;

revoke execute on function private.recurring_room_period(date, text, integer, integer, text) from public;

-- "Split by room for 1 Nov 2026 – 30 Nov 2026.", as the app words it.
create function private.room_split_note(p_from date, p_to date)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Split by room for ' || to_char(p_from, 'FMDD Mon YYYY') || ' – ' || to_char(p_to, 'FMDD Mon YYYY') || '.'
$$;

revoke execute on function private.room_split_note(date, date) from public;

-- Validation -----------------------------------------------------------------------------

-- As in 20261116120100_add_repeatable_expenses.sql, accepting a split by
-- room, which needs a room in use and names nobody ahead.
create or replace function private.require_valid_template(
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
  if p_kind = 'variable' and p_split_method = 'fixed' then
    raise exception 'fixed_split_needs_fixed_amount' using errcode = '22023';
  end if;
  if p_split_method = 'room' then
    if not exists (select 1 from public.rooms where apartment_id = p_apartment_id and archived_at is null) then
      raise exception 'no_rooms' using errcode = '22023';
    end if;
  else
    perform count(*) from private.compute_shares(coalesce(p_amount_minor, 10000), p_split_method, p_participants);
    perform private.require_current_members(p_apartment_id, p_participants, 'participant_not_member');
  end if;
  if p_collector_id is not null and not private.is_current_member_of(p_apartment_id, p_collector_id) then
    raise exception 'collector_not_member' using errcode = '22023';
  end if;
end;
$$;

-- A split by room needs its period; any other split has none.
create function private.require_room_period(p_split_method text, p_room_period text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_split_method = 'room' and (p_room_period is null or p_room_period not in ('advance', 'arrears')) then
    raise exception 'invalid_room_period' using errcode = '22023';
  end if;
  if p_split_method is distinct from 'room' and p_room_period is not null then
    raise exception 'room_period_without_room_split' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.require_room_period(text, text) from public;

-- Managing templates ---------------------------------------------------------------------

-- As in 20261116120100_add_repeatable_expenses.sql, with p_room_period. A
-- split by room stores no participants.
drop function public.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid);
drop function private.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid);

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
  p_client_request_id uuid,
  p_room_period text
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
  clean_participants jsonb := case when p_split_method = 'room' then '[]'::jsonb else p_participants end;
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
    p_due_after_days, p_split_method, clean_participants, p_collector_id
  );
  perform private.require_room_period(p_split_method, p_room_period);

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
    collector_id, split_method, participants, room_period, next_bill_date, created_by, client_request_id
  )
  values (
    p_apartment_id, btrim(p_title), p_kind, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day,
    p_due_after_days, p_collector_id, p_split_method, clean_participants, p_room_period, first_date, admin_id,
    p_client_request_id
  )
  returning id into new_template;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'recurring_template', new_template, 'created',
          jsonb_build_object('kind', p_kind, 'first_date', first_date));

  return new_template;
end;
$$;

drop function public.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid);
drop function private.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid);

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
  p_collector_id uuid,
  p_room_period text
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
  clean_participants jsonb := case when p_split_method = 'room' then '[]'::jsonb else p_participants end;
begin
  select * into template from public.recurring_templates where id = p_template_id for update;
  if template.id is null or not private.is_apartment_admin(template.apartment_id) then
    raise exception 'recurring_template_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(template.apartment_id);
  if template.archived_at is not null then
    raise exception 'recurring_template_archived' using errcode = 'P0001';
  end if;

  perform private.require_valid_template(
    template.apartment_id, p_title, template.kind, p_amount_minor, p_repeat_unit, p_repeat_every,
    p_bill_day, p_due_after_days, p_split_method, clean_participants, p_collector_id
  );
  perform private.require_room_period(p_split_method, p_room_period);

  next_date := template.next_bill_date;
  if p_repeat_unit = 'month' then
    next_date := private.period_bill_date(next_date, p_bill_day);
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
      participants = clean_participants,
      room_period = p_room_period,
      collector_id = p_collector_id
  where id = template.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (template.apartment_id, admin_id, 'recurring_template', template.id, 'edited',
          jsonb_build_object('from_date', next_date));
end;
$$;

revoke execute on function private.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid, text) from public;
revoke execute on function private.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid, text) from public;
grant execute on function private.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid, text) to authenticated;
grant execute on function private.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid, text) to authenticated;

-- App versions that do not send p_room_period still match these wrappers.
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
  p_client_request_id uuid default null,
  p_room_period text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_recurring_template(
    p_apartment_id, p_title, p_kind, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day,
    p_due_after_days, p_split_method, p_participants, p_collector_id, p_first_date, p_client_request_id,
    p_room_period
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
  p_collector_id uuid default null,
  p_room_period text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_recurring_template(
    p_template_id, p_title, p_amount_minor, p_repeat_unit, p_repeat_every, p_bill_day, p_due_after_days,
    p_split_method, p_participants, p_collector_id, p_room_period
  );
$$;

revoke execute on function public.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid, text) from public, anon;
revoke execute on function public.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid, text) from public, anon;
grant execute on function public.create_recurring_template(uuid, text, text, bigint, text, integer, integer, integer, text, jsonb, uuid, date, uuid, text) to authenticated;
grant execute on function public.update_recurring_template(uuid, text, bigint, text, integer, integer, integer, text, jsonb, uuid, text) to authenticated;

-- Charging -------------------------------------------------------------------------------

-- The split by room of p_amount_minor for one charge, as the participants of
-- a split by amount (null when nobody lived in a room then), whether anyone's
-- days were left out, and the note for the charge.
create function private.recurring_room_shares(p_instance_id uuid, p_amount_minor bigint)
returns table (participants jsonb, left_out boolean, note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  instance public.recurring_instances;
  template public.recurring_templates;
  period_from date;
  period_to date;
begin
  select * into instance from public.recurring_instances where id = p_instance_id;
  select * into template from public.recurring_templates where id = instance.template_id;
  select p.starts_on, p.ends_on into period_from, period_to
  from private.recurring_room_period(
    instance.bill_date, template.repeat_unit, template.repeat_every, template.bill_day,
    -- A template not split by room still gets a sensible period when one bill is.
    coalesce(template.room_period, case template.kind when 'fixed' then 'advance' else 'arrears' end)
  ) p;

  return query
  select
    jsonb_agg(jsonb_build_object('user_id', s.user_id, 'amount_minor', s.amount_minor) order by s.user_id)
      filter (where s.included and s.amount_minor > 0),
    coalesce(bool_or(not s.included), false),
    private.room_split_note(period_from, period_to)
  from private.room_split(instance.apartment_id, p_amount_minor, period_from, period_to) s;
end;
$$;

revoke execute on function private.recurring_room_shares(uuid, bigint) from public;

-- Notes the days a charge split by room covers. Called right after the charge
-- is posted, before anyone else can see it.
create function private.note_room_split(p_expense_id uuid, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.expenses set description = p_note where id = p_expense_id
$$;

revoke execute on function private.note_room_split(uuid, text) from public;

-- As in 20261116120100_add_repeatable_expenses.sql, charging a fixed amount
-- split by room when the split holds, and waiting for an admin otherwise.
create or replace function private.charge_next_period(p_template_id uuid)
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
  method text;
  chosen_participants jsonb;
  note text;
  left_out boolean;
  charge uuid;
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

  if instance_id is null then
    return;
  end if;

  method := template.split_method;
  chosen_participants := template.participants;
  if template.kind = 'fixed' and template.split_method = 'room' then
    begin
      select r.participants, r.left_out, r.note into chosen_participants, left_out, note
      from private.recurring_room_shares(instance_id, template.amount_minor) r;
    exception when sqlstate '22023' then
      -- Nobody lived in a room during the period.
      chosen_participants := null;
    end;
    method := 'fixed';
    split_holds := chosen_participants is not null and not coalesce(left_out, true);
  else
    split_holds := not exists (
      select 1 from jsonb_array_elements(template.participants) p
      where not private.is_current_member_of(template.apartment_id, (p ->> 'user_id')::uuid)
    );
  end if;

  if template.kind = 'fixed' and split_holds then
    charge := private.post_recurring_charge(
      instance_id, template.amount_minor, method, chosen_participants,
      bill_date + template.due_after_days,
      case when template.collector_id is not null
                and private.is_current_member_of(template.apartment_id, template.collector_id)
           then template.collector_id end,
      null
    );
    if note is not null then
      perform private.note_room_split(charge, note);
    end if;
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

-- As in 20261116120100_add_repeatable_expenses.sql. p_split_method 'room'
-- splits this bill by room for its period on the server, whatever the
-- template's split; p_participants is then ignored. The admin has chosen it,
-- so days left out of the split do not stop it.
create or replace function private.post_recurring_bill(
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
  method text := p_split_method;
  chosen_participants jsonb := p_participants;
  note text;
  charge uuid;
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

  if method = 'room' then
    select r.participants, r.note into chosen_participants, note
    from private.recurring_room_shares(instance.id, p_amount_minor) r;
    method := 'fixed';
  end if;

  perform count(*) from private.compute_shares(p_amount_minor, method, chosen_participants);
  perform private.require_current_members(instance.apartment_id, chosen_participants, 'participant_not_member');
  if p_collector_id is not null and not private.is_current_member_of(instance.apartment_id, p_collector_id) then
    raise exception 'collector_not_member' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < instance.bill_date then
    raise exception 'due_date_before_expense_date' using errcode = '22023';
  end if;

  charge := private.post_recurring_charge(
    instance.id, p_amount_minor, method, chosen_participants, p_due_date, p_collector_id, admin_id
  );
  if note is not null then
    perform private.note_room_split(charge, note);
  end if;
  return charge;
end;
$$;
