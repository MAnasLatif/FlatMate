-- Apartment settings and expense categories (SRS FR-08.1, section 3.3).
--
-- Admins change the apartment's details and its settlement day and objection
-- window. The currency is fixed at creation (SRS section 12, item 7). A
-- settlement day change applies from the next period (item 9): a settlement
-- period's dates are fixed when it opens, so only later periods see the change.

create function private.update_apartment_settings(
  p_apartment_id uuid,
  p_name text,
  p_location text,
  p_show_location boolean,
  p_timezone text,
  p_settlement_day integer,
  p_approval_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  before_row public.apartments;
  after_row public.apartments;
begin
  perform private.require_valid_timezone(p_timezone);

  select * into before_row from public.apartments where id = p_apartment_id;

  update public.apartments
  set name = btrim(p_name),
      location = nullif(btrim(p_location), ''),
      show_location = coalesce(p_show_location, false),
      timezone = p_timezone,
      settlement_day = p_settlement_day,
      approval_days = p_approval_days
  where id = p_apartment_id
  returning * into after_row;

  if row(before_row.name, before_row.location, before_row.show_location, before_row.timezone,
         before_row.settlement_day, before_row.approval_days)
     is distinct from
     row(after_row.name, after_row.location, after_row.show_location, after_row.timezone,
         after_row.settlement_day, after_row.approval_days) then
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
    values (
      p_apartment_id, admin_id, 'apartment', p_apartment_id, 'settings_changed',
      jsonb_build_object(
        'before', jsonb_build_object(
          'name', before_row.name, 'location', before_row.location,
          'show_location', before_row.show_location, 'timezone', before_row.timezone,
          'settlement_day', before_row.settlement_day, 'approval_days', before_row.approval_days),
        'after', jsonb_build_object(
          'name', after_row.name, 'location', after_row.location,
          'show_location', after_row.show_location, 'timezone', after_row.timezone,
          'settlement_day', after_row.settlement_day, 'approval_days', after_row.approval_days)
      )
    );
  end if;
end;
$$;

revoke execute on function private.update_apartment_settings(uuid, text, text, boolean, text, integer, integer)
from public;
grant execute on function private.update_apartment_settings(uuid, text, text, boolean, text, integer, integer)
to authenticated;

create function public.update_apartment_settings(
  p_apartment_id uuid,
  p_name text,
  p_location text,
  p_show_location boolean,
  p_timezone text,
  p_settlement_day integer,
  p_approval_days integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_apartment_settings(
    p_apartment_id, p_name, p_location, p_show_location, p_timezone, p_settlement_day, p_approval_days
  );
$$;

revoke execute on function public.update_apartment_settings(uuid, text, text, boolean, text, integer, integer)
from public, anon;
grant execute on function public.update_apartment_settings(uuid, text, text, boolean, text, integer, integer)
to authenticated;

-- Expense categories ----------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  -- Archived, never deleted: expenses keep pointing at their category.
  archived_at timestamptz,
  constraint expense_categories_name_valid check (char_length(name) between 1 and 40 and name = btrim(name))
);

create unique index expense_categories_unique_active_name
on public.expense_categories (apartment_id, lower(name))
where archived_at is null;

alter table public.expense_categories enable row level security;

revoke all on table public.expense_categories from anon, authenticated;
grant select on table public.expense_categories to authenticated;

create policy "Members can read their apartment's categories"
on public.expense_categories
for select
to authenticated
using ((select private.has_membership_history(apartment_id)));

-- Every apartment starts with a set of common categories.
create function private.add_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (apartment_id, name)
  select new.id, category
  from unnest(array[
    'Rent', 'Utilities', 'Internet', 'Groceries', 'Household', 'Cleaning', 'Maintenance', 'Other'
  ]) as category;
  return new;
end;
$$;

revoke execute on function private.add_default_categories() from public;

create trigger apartments_add_default_categories
after insert on public.apartments
for each row
execute function private.add_default_categories();

-- Apartments created before this migration get the defaults too.
insert into public.expense_categories (apartment_id, name)
select a.id, category
from public.apartments a
cross join unnest(array[
  'Rent', 'Utilities', 'Internet', 'Groceries', 'Household', 'Cleaning', 'Maintenance', 'Other'
]) as category;

create function private.category_apartment(p_category_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owning_apartment uuid;
begin
  select apartment_id into owning_apartment from public.expense_categories where id = p_category_id;
  if owning_apartment is null then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  return owning_apartment;
end;
$$;

revoke execute on function private.category_apartment(uuid) from public;

create function private.add_category(p_apartment_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  new_category uuid;
begin
  insert into public.expense_categories (apartment_id, name)
  values (p_apartment_id, btrim(p_name))
  returning id into new_category;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'category', new_category, 'created', jsonb_build_object('name', btrim(p_name)));

  return new_category;
end;
$$;

create function private.rename_category(p_category_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owning_apartment uuid := private.category_apartment(p_category_id);
  admin_id uuid := private.require_admin(owning_apartment);
  old_name text;
begin
  select name into old_name from public.expense_categories where id = p_category_id;

  update public.expense_categories set name = btrim(p_name) where id = p_category_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    owning_apartment, admin_id, 'category', p_category_id, 'renamed',
    jsonb_build_object('from', old_name, 'to', btrim(p_name))
  );
end;
$$;

create function private.archive_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owning_apartment uuid := private.category_apartment(p_category_id);
  admin_id uuid := private.require_admin(owning_apartment);
begin
  update public.expense_categories
  set archived_at = now()
  where id = p_category_id and archived_at is null;

  if found then
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
    values (owning_apartment, admin_id, 'category', p_category_id, 'archived');
  end if;
end;
$$;

revoke execute on function private.add_category(uuid, text) from public;
revoke execute on function private.rename_category(uuid, text) from public;
revoke execute on function private.archive_category(uuid) from public;
grant execute on function private.add_category(uuid, text) to authenticated;
grant execute on function private.rename_category(uuid, text) to authenticated;
grant execute on function private.archive_category(uuid) to authenticated;

create function public.add_category(p_apartment_id uuid, p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.add_category(p_apartment_id, p_name) $$;

create function public.rename_category(p_category_id uuid, p_name text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.rename_category(p_category_id, p_name) $$;

create function public.archive_category(p_category_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.archive_category(p_category_id) $$;

revoke execute on function public.add_category(uuid, text) from public, anon;
revoke execute on function public.rename_category(uuid, text) from public, anon;
revoke execute on function public.archive_category(uuid) from public, anon;
grant execute on function public.add_category(uuid, text) to authenticated;
grant execute on function public.rename_category(uuid, text) to authenticated;
grant execute on function public.archive_category(uuid) to authenticated;
