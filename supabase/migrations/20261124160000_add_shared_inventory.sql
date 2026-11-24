-- Shared inventory (SRS FR-10.5; task 3.2, decision 26).
--
-- The things a flat keeps track of: a fridge bought together, or a member's
-- own washing machine that everyone uses. An item belongs to the flat or to
-- one member; that is a record of who owns it and moves no money. What an
-- item cost to buy and to keep working are ordinary expenses linked to it,
-- so they are split, disputed and settled like any other expense and the
-- item only adds them up. Condition and status (in use, needs repair, gone)
-- are records too: selling or throwing something away, or a member taking
-- their item with them, changes its status, and any money involved is
-- entered as an expense or a payment.
--
-- Every current member sees the inventory. Anyone who may add expenses adds
-- items, changes them, and links expenses to them; admins remove items added
-- by mistake. Each change is an entry in the activity history.

-- Items ------------------------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name text not null,
  notes text,
  -- 'apartment': the flat's, owned together. 'member': owner_id's own.
  owner_type text not null,
  owner_id uuid references public.profiles (id) on delete restrict,
  condition text not null default 'good',
  status text not null default 'in_use',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set by the app so that a retried request cannot add a second item.
  client_request_id uuid,
  constraint inventory_items_name_valid check (char_length(name) between 1 and 80 and name = btrim(name)),
  constraint inventory_items_notes_valid check (
    notes is null or (char_length(notes) between 1 and 500 and notes = btrim(notes))
  ),
  constraint inventory_items_owner_valid check (
    (owner_type = 'apartment' and owner_id is null) or (owner_type = 'member' and owner_id is not null)
  ),
  constraint inventory_items_condition_valid check (condition in ('new', 'good', 'fair', 'poor')),
  constraint inventory_items_status_valid check (status in ('in_use', 'needs_repair', 'gone')),
  constraint inventory_items_request_unique unique (apartment_id, client_request_id)
);

create index inventory_items_apartment on public.inventory_items (apartment_id, lower(name));
create index inventory_items_owner on public.inventory_items (owner_id) where owner_id is not null;

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row
execute function private.set_updated_at();

alter table public.inventory_items enable row level security;
revoke all on table public.inventory_items from anon, authenticated;
grant select on table public.inventory_items to authenticated;

create policy "Members read their apartment's inventory"
on public.inventory_items
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- Expenses linked to an item: what it cost to buy, and to keep working. An
-- expense counts towards one item at most. The link is a label, not a
-- financial record, so it can be changed or removed; the expense stays.
create table public.inventory_costs (
  expense_id uuid primary key references public.expenses (id) on delete restrict,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  kind text not null,
  linked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_costs_kind_valid check (kind in ('purchase', 'maintenance'))
);

create index inventory_costs_item on public.inventory_costs (item_id);
create index inventory_costs_apartment on public.inventory_costs (apartment_id);

alter table public.inventory_costs enable row level security;
revoke all on table public.inventory_costs from anon, authenticated;
grant select on table public.inventory_costs to authenticated;

create policy "Members read their apartment's inventory costs"
on public.inventory_costs
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- Keeps the list usable on a phone.
create function private.max_inventory_items()
returns integer
language sql
immutable
set search_path = ''
as $$ select 300 $$;

revoke execute on function private.max_inventory_items() from public;

-- Writing ----------------------------------------------------------------------------------

-- Adds an item (p_item_id null) or changes one. A member owner must be a
-- current member, unless the item already belonged to them before they left.
-- The audit entry keeps the item's name, so the history still reads after
-- the item is removed, and which fields changed.
create function private.save_inventory_item(
  p_apartment_id uuid,
  p_item_id uuid,
  p_name text,
  p_owner_type text,
  p_owner_id uuid,
  p_condition text,
  p_status text,
  p_notes text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid := private.require_expense_author(p_apartment_id);
  clean_name text := btrim(coalesce(p_name, ''));
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  existing public.inventory_items;
  saved uuid;
  changed text[] := array[]::text[];
begin
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'invalid_item_name' using errcode = '22023';
  end if;
  if char_length(clean_notes) > 500 then
    raise exception 'item_notes_too_long' using errcode = '22023';
  end if;
  if p_owner_type is null or p_owner_type not in ('apartment', 'member')
     or (p_owner_type = 'apartment') <> (p_owner_id is null) then
    raise exception 'invalid_item_owner' using errcode = '22023';
  end if;
  if p_condition is null or p_condition not in ('new', 'good', 'fair', 'poor') then
    raise exception 'invalid_item_condition' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('in_use', 'needs_repair', 'gone') then
    raise exception 'invalid_item_status' using errcode = '22023';
  end if;

  if p_item_id is not null then
    select * into existing from public.inventory_items
    where id = p_item_id and apartment_id = p_apartment_id
    for update;
    if existing.id is null then
      raise exception 'item_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p_owner_id is not null
     and p_owner_id is distinct from existing.owner_id
     and not private.is_current_member_of(p_apartment_id, p_owner_id) then
    raise exception 'item_owner_not_member' using errcode = '22023';
  end if;

  if existing.id is null then
    -- A retry of an add that already went through returns the same item.
    if p_request_id is not null then
      select id into saved from public.inventory_items
      where apartment_id = p_apartment_id and client_request_id = p_request_id;
      if saved is not null then
        return saved;
      end if;
    end if;
    if (select count(*) from public.inventory_items where apartment_id = p_apartment_id)
       >= private.max_inventory_items() then
      raise exception 'too_many_items' using errcode = '22023';
    end if;

    insert into public.inventory_items (
      apartment_id, name, notes, owner_type, owner_id, condition, status, created_by, client_request_id
    )
    values (
      p_apartment_id, clean_name, clean_notes, p_owner_type, p_owner_id, p_condition, p_status, author, p_request_id
    )
    returning id into saved;

    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
    values (p_apartment_id, author, 'inventory_item', saved, 'created', jsonb_build_object('name', clean_name));
    return saved;
  end if;

  if clean_name <> existing.name then changed := array_append(changed, 'name'); end if;
  if clean_notes is distinct from existing.notes then changed := array_append(changed, 'notes'); end if;
  if p_owner_type <> existing.owner_type or p_owner_id is distinct from existing.owner_id then
    changed := array_append(changed, 'owner');
  end if;
  if p_condition <> existing.condition then changed := array_append(changed, 'condition'); end if;
  if p_status <> existing.status then changed := array_append(changed, 'status'); end if;
  if cardinality(changed) = 0 then
    return existing.id;
  end if;

  update public.inventory_items
  set name = clean_name,
      notes = clean_notes,
      owner_type = p_owner_type,
      owner_id = p_owner_id,
      condition = p_condition,
      status = p_status
  where id = existing.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_apartment_id, author, 'inventory_item', existing.id, 'updated',
    jsonb_build_object('name', clean_name, 'changed', to_jsonb(changed), 'status', p_status, 'condition', p_condition)
  );
  return existing.id;
end;
$$;

revoke execute on function private.save_inventory_item(uuid, uuid, text, text, uuid, text, text, text, uuid) from public;
grant execute on function private.save_inventory_item(uuid, uuid, text, text, uuid, text, text, text, uuid) to authenticated;

-- Removes an item added by mistake, and its links; the linked expenses stay.
-- Admins only: an item that is gone is marked so instead, keeping its history.
create function private.remove_inventory_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.inventory_items;
  me uuid := private.require_user();
begin
  select * into item from public.inventory_items where id = p_item_id for update;
  if item.id is null or not private.is_active_member(item.apartment_id) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if not private.is_apartment_admin(item.apartment_id) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  delete from public.inventory_items where id = p_item_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (item.apartment_id, me, 'inventory_item', item.id, 'removed', jsonb_build_object('name', item.name));
end;
$$;

revoke execute on function private.remove_inventory_item(uuid) from public;
grant execute on function private.remove_inventory_item(uuid) to authenticated;

-- Counts an expense towards an item, as its purchase or as maintenance. An
-- expense already linked elsewhere moves to this item. A cancelled expense
-- cost nothing, so it cannot be linked.
create function private.link_inventory_cost(p_expense_id uuid, p_item_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense public.expenses;
  item public.inventory_items;
  author uuid;
begin
  select * into expense from public.expenses where id = p_expense_id;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  author := private.require_expense_author(expense.apartment_id);
  if p_kind is null or p_kind not in ('purchase', 'maintenance') then
    raise exception 'invalid_cost_kind' using errcode = '22023';
  end if;
  select * into item from public.inventory_items
  where id = p_item_id and apartment_id = expense.apartment_id
  for update;
  if item.id is null then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if expense.status = 'void' then
    raise exception 'expense_void' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.inventory_costs
    where expense_id = p_expense_id and item_id = p_item_id and kind = p_kind
  ) then
    return;
  end if;

  insert into public.inventory_costs (expense_id, item_id, apartment_id, kind, linked_by)
  values (p_expense_id, p_item_id, expense.apartment_id, p_kind, author)
  on conflict (expense_id) do update
  set item_id = excluded.item_id,
      kind = excluded.kind,
      linked_by = excluded.linked_by,
      created_at = now();

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    expense.apartment_id, author, 'inventory_item', item.id, 'cost_linked',
    jsonb_build_object('name', item.name, 'expense_id', expense.id, 'expense_title', expense.title, 'kind', p_kind)
  );
end;
$$;

revoke execute on function private.link_inventory_cost(uuid, uuid, text) from public;
grant execute on function private.link_inventory_cost(uuid, uuid, text) to authenticated;

-- Stops an expense counting towards its item. Nothing happens to the expense.
create function private.unlink_inventory_cost(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.inventory_costs;
  item public.inventory_items;
  author uuid;
begin
  select * into link from public.inventory_costs where expense_id = p_expense_id for update;
  if link.expense_id is null or not private.is_active_member(link.apartment_id) then
    raise exception 'cost_not_linked' using errcode = 'P0002';
  end if;
  author := private.require_expense_author(link.apartment_id);
  select * into item from public.inventory_items where id = link.item_id;

  delete from public.inventory_costs where expense_id = p_expense_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    link.apartment_id, author, 'inventory_item', item.id, 'cost_unlinked',
    jsonb_build_object(
      'name', item.name, 'expense_id', p_expense_id, 'kind', link.kind,
      'expense_title', (select title from public.expenses where id = p_expense_id)
    )
  );
end;
$$;

revoke execute on function private.unlink_inventory_cost(uuid) from public;
grant execute on function private.unlink_inventory_cost(uuid) to authenticated;

create function public.save_inventory_item(
  p_apartment_id uuid,
  p_name text,
  p_owner_type text,
  p_item_id uuid default null,
  p_owner_id uuid default null,
  p_condition text default 'good',
  p_status text default 'in_use',
  p_notes text default null,
  p_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_inventory_item(
    p_apartment_id, p_item_id, p_name, p_owner_type, p_owner_id, p_condition, p_status, p_notes, p_request_id
  )
$$;

revoke execute on function public.save_inventory_item(uuid, text, text, uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.save_inventory_item(uuid, text, text, uuid, uuid, text, text, text, uuid) to authenticated;

create function public.remove_inventory_item(p_item_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_inventory_item(p_item_id) $$;

revoke execute on function public.remove_inventory_item(uuid) from public, anon;
grant execute on function public.remove_inventory_item(uuid) to authenticated;

create function public.link_inventory_cost(p_expense_id uuid, p_item_id uuid, p_kind text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.link_inventory_cost(p_expense_id, p_item_id, p_kind) $$;

revoke execute on function public.link_inventory_cost(uuid, uuid, text) from public, anon;
grant execute on function public.link_inventory_cost(uuid, uuid, text) to authenticated;

create function public.unlink_inventory_cost(p_expense_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.unlink_inventory_cost(p_expense_id) $$;

revoke execute on function public.unlink_inventory_cost(uuid) from public, anon;
grant execute on function public.unlink_inventory_cost(uuid) to authenticated;

-- Reading ----------------------------------------------------------------------------------

-- The apartment's items by name, each with what its linked expenses add up
-- to now. Cancelled expenses count for nothing; has_provisional says a
-- total includes an expense that can still be objected to or is disputed.
create function public.get_inventory(p_apartment_id uuid)
returns table (
  id uuid,
  name text,
  notes text,
  owner_type text,
  owner_id uuid,
  condition text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  purchase_minor bigint,
  maintenance_minor bigint,
  cost_count integer,
  has_provisional boolean
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

  return query
  select i.id, i.name, i.notes, i.owner_type, i.owner_id, i.condition, i.status, i.created_by,
    i.created_at, i.updated_at,
    coalesce(sum(x.amount_minor) filter (where c.kind = 'purchase' and x.status <> 'void'), 0)::bigint,
    coalesce(sum(x.amount_minor) filter (where c.kind = 'maintenance' and x.status <> 'void'), 0)::bigint,
    count(c.expense_id)::integer,
    coalesce(bool_or(x.status in ('provisional', 'disputed')), false)
  from public.inventory_items i
  left join public.inventory_costs c on c.item_id = i.id
  left join public.expenses x on x.id = c.expense_id
  where i.apartment_id = p_apartment_id
  group by i.id
  order by lower(i.name), i.created_at;
end;
$$;

revoke execute on function public.get_inventory(uuid) from public, anon;
grant execute on function public.get_inventory(uuid) to authenticated;

-- Activity ---------------------------------------------------------------------------------

-- As in 20261124150000_add_security_deposits.sql, with inventory among expenses.
create or replace function private.activity_group(p_entity_type text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type = 'expense' and p_action like 'dispute\_%' then 'disputes'
    when p_entity_type in ('expense', 'inventory_item') then 'expenses'
    when p_entity_type in ('payment', 'offset', 'adjustment', 'settlement_period', 'deposit') then 'payments'
    when p_entity_type in ('member', 'join_request', 'rejoin_invite', 'invite') then 'members'
    else 'settings'
  end
$$;

-- As in 20261124150000_add_security_deposits.sql, naming inventory items,
-- from the entry itself once an item is removed.
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
  where e.apartment_id = p_apartment_id
    and (p_before is null or e.id < p_before)
    and (p_actor_id is null or e.actor_id = p_actor_id)
    and (p_group is null or private.activity_group(e.entity_type, e.action) = p_group)
  order by e.id desc
  limit p_limit;
end;
$$;
