-- Rooms and occupancy (SRS FR-10.6; task 3.3, decision 27).
--
-- Admins describe the flat's rooms, each with a weight for its part of a
-- bill (a large room 3, a small one 2), and who lived in each from which day
-- to which day. A bill for a period can then be split by room: every day of
-- the period is worth the same, a day's part is shared by the rooms someone
-- lived in that day in proportion to their weights, and a room's part
-- equally by the people in it that day. A room nobody lived in on a day
-- leaves its part to the occupied rooms, and a day nobody lived anywhere
-- counts for nothing.
--
-- The split is a calculation, not a record: get_room_split works it out and
-- the app posts the expense with those amounts as a split by amount, so
-- changing rooms or dates later never changes a posted expense. Rooms and
-- occupancy move no money themselves.
--
-- Only current members are in a split, since only they can share a new
-- expense. The days of someone who has left are reported as left out, and
-- their room counts as empty on those days.

-- Rooms ------------------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name text not null,
  weight integer not null default 1,
  -- A room no longer used: kept for the periods it was lived in.
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set by the app so that a retried request cannot add a second room.
  client_request_id uuid,
  constraint rooms_name_valid check (char_length(name) between 1 and 60 and name = btrim(name)),
  constraint rooms_weight_valid check (weight between 1 and 100),
  constraint rooms_request_unique unique (apartment_id, client_request_id)
);

create unique index rooms_name_unique on public.rooms (apartment_id, lower(name)) where archived_at is null;

create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function private.set_updated_at();

alter table public.rooms enable row level security;
revoke all on table public.rooms from anon, authenticated;
grant select on table public.rooms to authenticated;

create policy "Members read their apartment's rooms"
on public.rooms
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- Who lived in a room, from starts_on to ends_on, both included. An open
-- end means they still live there. One person is in one room at a time.
create table public.room_occupancies (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  starts_on date not null,
  ends_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint room_occupancies_dates_valid check (ends_on is null or ends_on >= starts_on)
);

create index room_occupancies_room on public.room_occupancies (room_id);
create index room_occupancies_apartment_dates on public.room_occupancies (apartment_id, starts_on);
create index room_occupancies_user on public.room_occupancies (user_id);

alter table public.room_occupancies enable row level security;
revoke all on table public.room_occupancies from anon, authenticated;
grant select on table public.room_occupancies to authenticated;

create policy "Members read their apartment's room occupancy"
on public.room_occupancies
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

create function private.max_rooms()
returns integer
language sql
immutable
set search_path = ''
as $$ select 30 $$;

revoke execute on function private.max_rooms() from public;

-- The caller, when they are an admin of the apartment; otherwise raises.
create function private.require_room_admin(p_apartment_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
begin
  if not private.is_apartment_admin(p_apartment_id) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke execute on function private.require_room_admin(uuid) from public;

-- Room and occupancy changes in one apartment happen one at a time, so two
-- admins cannot put one person in two rooms on the same days.
create function private.lock_rooms(p_apartment_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('rooms:' || p_apartment_id::text, 0))
$$;

revoke execute on function private.lock_rooms(uuid) from public;

-- Writing ----------------------------------------------------------------------------------

-- Adds a room (p_room_id null) or renames it and changes its weight.
create function private.save_room(
  p_apartment_id uuid,
  p_room_id uuid,
  p_name text,
  p_weight integer,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_room_admin(p_apartment_id);
  clean_name text := btrim(coalesce(p_name, ''));
  existing public.rooms;
  saved uuid;
begin
  if char_length(clean_name) not between 1 and 60 then
    raise exception 'invalid_room_name' using errcode = '22023';
  end if;
  if p_weight is null or p_weight not between 1 and 100 then
    raise exception 'invalid_room_weight' using errcode = '22023';
  end if;
  perform private.lock_rooms(p_apartment_id);

  if p_room_id is not null then
    select * into existing from public.rooms where id = p_room_id and apartment_id = p_apartment_id;
    if existing.id is null then
      raise exception 'room_not_found' using errcode = 'P0002';
    end if;
    if existing.archived_at is not null then
      raise exception 'room_archived' using errcode = '22023';
    end if;
  elsif p_request_id is not null then
    select id into saved from public.rooms where apartment_id = p_apartment_id and client_request_id = p_request_id;
    if saved is not null then
      return saved;
    end if;
  end if;

  if exists (
    select 1 from public.rooms
    where apartment_id = p_apartment_id and archived_at is null
      and lower(name) = lower(clean_name) and id is distinct from existing.id
  ) then
    raise exception 'room_name_taken' using errcode = '23505';
  end if;

  if existing.id is null then
    if (select count(*) from public.rooms where apartment_id = p_apartment_id and archived_at is null)
       >= private.max_rooms() then
      raise exception 'too_many_rooms' using errcode = '22023';
    end if;
    insert into public.rooms (apartment_id, name, weight, created_by, client_request_id)
    values (p_apartment_id, clean_name, p_weight, admin, p_request_id)
    returning id into saved;

    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
    values (p_apartment_id, admin, 'room', saved, 'created',
            jsonb_build_object('name', clean_name, 'weight', p_weight));
    return saved;
  end if;

  if clean_name = existing.name and p_weight = existing.weight then
    return existing.id;
  end if;
  update public.rooms set name = clean_name, weight = p_weight where id = existing.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin, 'room', existing.id, 'updated',
          jsonb_build_object('name', clean_name, 'from_name', existing.name,
                             'weight', p_weight, 'from_weight', existing.weight));
  return existing.id;
end;
$$;

revoke execute on function private.save_room(uuid, uuid, text, integer, uuid) from public;
grant execute on function private.save_room(uuid, uuid, text, integer, uuid) to authenticated;

-- Stops using a room. Its past occupancy stays and still counts for the
-- periods it covers; nobody can still be living in it.
create function private.archive_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.rooms;
  admin uuid;
begin
  select * into room from public.rooms where id = p_room_id;
  if room.id is null or not private.is_active_member(room.apartment_id) then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  admin := private.require_room_admin(room.apartment_id);
  perform private.lock_rooms(room.apartment_id);
  if room.archived_at is not null then
    return;
  end if;
  if exists (select 1 from public.room_occupancies where room_id = p_room_id and ends_on is null) then
    raise exception 'room_occupied' using errcode = '22023';
  end if;

  update public.rooms set archived_at = now() where id = p_room_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (room.apartment_id, admin, 'room', room.id, 'archived', jsonb_build_object('name', room.name));
end;
$$;

revoke execute on function private.archive_room(uuid) from public;
grant execute on function private.archive_room(uuid) to authenticated;

-- Records that a current member lives (or lived) in a room from p_starts_on,
-- until p_ends_on when given. They cannot be in another room on those days.
create function private.add_room_occupant(p_room_id uuid, p_user_id uuid, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  room public.rooms;
  admin uuid;
  saved uuid;
begin
  select * into room from public.rooms where id = p_room_id;
  if room.id is null or not private.is_active_member(room.apartment_id) then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  admin := private.require_room_admin(room.apartment_id);
  perform private.lock_rooms(room.apartment_id);
  if room.archived_at is not null then
    raise exception 'room_archived' using errcode = '22023';
  end if;
  if p_user_id is null or not private.is_current_member_of(room.apartment_id, p_user_id) then
    raise exception 'occupant_not_member' using errcode = '22023';
  end if;
  if p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception 'invalid_occupancy_dates' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.room_occupancies o
    where o.apartment_id = room.apartment_id and o.user_id = p_user_id
      and daterange(o.starts_on, o.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    raise exception 'occupancy_overlaps' using errcode = '22023';
  end if;

  insert into public.room_occupancies (room_id, apartment_id, user_id, starts_on, ends_on, created_by)
  values (room.id, room.apartment_id, p_user_id, p_starts_on, p_ends_on, admin)
  returning id into saved;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (room.apartment_id, admin, 'room', room.id, 'occupant_added',
          jsonb_build_object('name', room.name, 'user_id', p_user_id, 'starts_on', p_starts_on, 'ends_on', p_ends_on));
  return saved;
end;
$$;

revoke execute on function private.add_room_occupant(uuid, uuid, date, date) from public;
grant execute on function private.add_room_occupant(uuid, uuid, date, date) to authenticated;

-- Records the last day someone lived in a room: they moved out or changed rooms.
create function private.end_room_occupancy(p_occupancy_id uuid, p_ends_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupancy public.room_occupancies;
  admin uuid;
begin
  select * into occupancy from public.room_occupancies where id = p_occupancy_id;
  if occupancy.id is null or not private.is_active_member(occupancy.apartment_id) then
    raise exception 'occupancy_not_found' using errcode = 'P0002';
  end if;
  admin := private.require_room_admin(occupancy.apartment_id);
  perform private.lock_rooms(occupancy.apartment_id);
  if occupancy.ends_on is not null then
    raise exception 'occupancy_already_ended' using errcode = '22023';
  end if;
  if p_ends_on is null or p_ends_on < occupancy.starts_on then
    raise exception 'invalid_occupancy_dates' using errcode = '22023';
  end if;

  update public.room_occupancies set ends_on = p_ends_on where id = p_occupancy_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (occupancy.apartment_id, admin, 'room', occupancy.room_id, 'occupancy_ended',
          jsonb_build_object('name', (select name from public.rooms where id = occupancy.room_id),
                             'user_id', occupancy.user_id, 'ends_on', p_ends_on));
end;
$$;

revoke execute on function private.end_room_occupancy(uuid, date) from public;
grant execute on function private.end_room_occupancy(uuid, date) to authenticated;

-- Deletes an occupancy entered by mistake. Expenses already split by room
-- keep their amounts.
create function private.remove_room_occupancy(p_occupancy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupancy public.room_occupancies;
  admin uuid;
begin
  select * into occupancy from public.room_occupancies where id = p_occupancy_id;
  if occupancy.id is null or not private.is_active_member(occupancy.apartment_id) then
    raise exception 'occupancy_not_found' using errcode = 'P0002';
  end if;
  admin := private.require_room_admin(occupancy.apartment_id);
  perform private.lock_rooms(occupancy.apartment_id);

  delete from public.room_occupancies where id = p_occupancy_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (occupancy.apartment_id, admin, 'room', occupancy.room_id, 'occupancy_removed',
          jsonb_build_object('name', (select name from public.rooms where id = occupancy.room_id),
                             'user_id', occupancy.user_id, 'starts_on', occupancy.starts_on,
                             'ends_on', occupancy.ends_on));
end;
$$;

revoke execute on function private.remove_room_occupancy(uuid) from public;
grant execute on function private.remove_room_occupancy(uuid) to authenticated;

create function public.save_room(
  p_apartment_id uuid,
  p_name text,
  p_weight integer,
  p_room_id uuid default null,
  p_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.save_room(p_apartment_id, p_room_id, p_name, p_weight, p_request_id) $$;

revoke execute on function public.save_room(uuid, text, integer, uuid, uuid) from public, anon;
grant execute on function public.save_room(uuid, text, integer, uuid, uuid) to authenticated;

create function public.archive_room(p_room_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.archive_room(p_room_id) $$;

revoke execute on function public.archive_room(uuid) from public, anon;
grant execute on function public.archive_room(uuid) to authenticated;

create function public.add_room_occupant(
  p_room_id uuid,
  p_user_id uuid,
  p_starts_on date,
  p_ends_on date default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.add_room_occupant(p_room_id, p_user_id, p_starts_on, p_ends_on) $$;

revoke execute on function public.add_room_occupant(uuid, uuid, date, date) from public, anon;
grant execute on function public.add_room_occupant(uuid, uuid, date, date) to authenticated;

create function public.end_room_occupancy(p_occupancy_id uuid, p_ends_on date)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.end_room_occupancy(p_occupancy_id, p_ends_on) $$;

revoke execute on function public.end_room_occupancy(uuid, date) from public, anon;
grant execute on function public.end_room_occupancy(uuid, date) to authenticated;

create function public.remove_room_occupancy(p_occupancy_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_room_occupancy(p_occupancy_id) $$;

revoke execute on function public.remove_room_occupancy(uuid) from public, anon;
grant execute on function public.remove_room_occupancy(uuid) to authenticated;

-- The split ------------------------------------------------------------------------------

-- Splits p_amount_minor for the days p_from to p_to (both included) by room,
-- as described at the top. Each person's part is an exact fraction; each
-- gets its floor in minor units, and the units left over go to the largest
-- remainders, ties in user id order, as compute_shares does. Returns a row
-- per current member who lived in a room during the period, and a row with
-- included false and no amount for each former member whose days were left
-- out. Raises no_occupants when no current member lived in any room then.
create function public.get_room_split(
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
  -- A person's part of one day: their room's weight over the weight of the
  -- rooms lived in that day, shared by the people in the room. Each day's
  -- parts add up to one, so the parts add up to the number of days lived in.
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
  -- Floors first; the units they leave go to the largest remainders.
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

revoke execute on function public.get_room_split(uuid, bigint, date, date) from public, anon;
grant execute on function public.get_room_split(uuid, bigint, date, date) to authenticated;

-- Activity ---------------------------------------------------------------------------------

-- As in 20261124160000_add_shared_inventory.sql, naming rooms and the person
-- an occupancy change is about. Rooms stay under settings.
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
      when 'inventory_item' then coalesce(ii.name, e.details ->> 'name')
      when 'room' then coalesce(rm.name, e.details ->> 'name')
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
      when 'room' then (e.details ->> 'user_id')::uuid
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
  left join public.inventory_items ii on e.entity_type = 'inventory_item' and ii.id = e.entity_id
  left join public.rooms rm on e.entity_type = 'room' and rm.id = e.entity_id
  where e.apartment_id = p_apartment_id
    and (p_before is null or e.id < p_before)
    and (p_actor_id is null or e.actor_id = p_actor_id)
    and (p_group is null or private.activity_group(e.entity_type, e.action) = p_group)
  order by e.id desc
  limit p_limit;
end;
$$;
