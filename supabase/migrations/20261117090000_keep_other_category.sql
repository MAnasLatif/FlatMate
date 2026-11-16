-- Other is the catch-all category: an expense that fits nowhere else goes
-- there, with a word on what it was (category_detail). Every apartment keeps
-- it as it is, so it can be neither renamed nor archived, and no other
-- category can be renamed to take its place.
--
-- As in 20261113002907_add_apartment_settings.sql, with the check added.

create function private.require_not_other(p_category_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.expense_categories
    where id = p_category_id and lower(name) = 'other'
  ) then
    raise exception 'category_fixed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_not_other(uuid) from public;

create or replace function private.rename_category(p_category_id uuid, p_name text)
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
  perform private.require_not_other(p_category_id);
  if lower(btrim(p_name)) = 'other' then
    raise exception 'category_fixed' using errcode = '42501';
  end if;

  select name into old_name from public.expense_categories where id = p_category_id;

  update public.expense_categories set name = btrim(p_name) where id = p_category_id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    owning_apartment, admin_id, 'category', p_category_id, 'renamed',
    jsonb_build_object('from', old_name, 'to', btrim(p_name))
  );
end;
$$;

create or replace function private.archive_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owning_apartment uuid := private.category_apartment(p_category_id);
  admin_id uuid := private.require_admin(owning_apartment);
begin
  perform private.require_not_other(p_category_id);

  update public.expense_categories
  set archived_at = now()
  where id = p_category_id and archived_at is null;

  if found then
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
    values (owning_apartment, admin_id, 'category', p_category_id, 'archived');
  end if;
end;
$$;
