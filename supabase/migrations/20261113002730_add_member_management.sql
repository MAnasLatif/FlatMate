-- Managing members (SRS FR-02.4, FR-02.6, section 2).
--
-- Admins promote and demote admins, decide who may add expenses, and remove
-- members. Anyone may leave. An apartment with members always keeps at least
-- one admin. Leaving and removal end the membership period; nothing is
-- deleted, so financial history keeps its people.

create function private.active_admin_count(target_apartment uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.apartment_members
  where apartment_id = target_apartment and left_at is null and role = 'admin';
$$;

create function private.active_membership(target_apartment uuid, target_user uuid)
returns public.apartment_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership public.apartment_members;
begin
  select * into membership
  from public.apartment_members
  where apartment_id = target_apartment and user_id = target_user and left_at is null;
  if membership.id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  return membership;
end;
$$;

revoke execute on function private.active_admin_count(uuid) from public;
revoke execute on function private.active_membership(uuid, uuid) from public;

create function private.set_member_role(p_apartment_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  membership public.apartment_members := private.active_membership(p_apartment_id, p_user_id);
begin
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if membership.role = p_role then
    return;
  end if;
  if membership.role = 'admin' and private.active_admin_count(p_apartment_id) = 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.apartment_members set role = p_role where id = membership.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_apartment_id, admin_id, 'member', p_user_id, 'role_changed',
    jsonb_build_object('from', membership.role, 'to', p_role)
  );
end;
$$;

create function private.set_member_can_add_expense(
  p_apartment_id uuid,
  p_user_id uuid,
  p_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  membership public.apartment_members := private.active_membership(p_apartment_id, p_user_id);
begin
  if p_allowed is null then
    raise exception 'invalid_permission' using errcode = '22023';
  end if;
  if membership.can_add_expense = p_allowed then
    return;
  end if;

  update public.apartment_members set can_add_expense = p_allowed where id = membership.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    p_apartment_id, admin_id, 'member', p_user_id, 'expense_permission_changed',
    jsonb_build_object('can_add_expense', p_allowed)
  );
end;
$$;

create function private.remove_member(p_apartment_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  membership public.apartment_members := private.active_membership(p_apartment_id, p_user_id);
begin
  if p_user_id = admin_id then
    raise exception 'use_leave' using errcode = 'P0001';
  end if;

  update public.apartment_members
  set left_at = now(), left_reason = 'removed'
  where id = membership.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, admin_id, 'member', p_user_id, 'removed');
end;
$$;

create function private.leave_apartment(p_apartment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  leaver uuid := private.require_user();
  membership public.apartment_members := private.active_membership(p_apartment_id, leaver);
  others_remaining integer;
begin
  select count(*) into others_remaining
  from public.apartment_members
  where apartment_id = p_apartment_id and left_at is null and user_id <> leaver;

  -- The last admin hands over first, unless nobody else is left.
  if membership.role = 'admin'
     and others_remaining > 0
     and private.active_admin_count(p_apartment_id) = 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.apartment_members
  set left_at = now(), left_reason = 'left'
  where id = membership.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, leaver, 'member', leaver, 'left');
end;
$$;

revoke execute on function private.set_member_role(uuid, uuid, text) from public;
revoke execute on function private.set_member_can_add_expense(uuid, uuid, boolean) from public;
revoke execute on function private.remove_member(uuid, uuid) from public;
revoke execute on function private.leave_apartment(uuid) from public;
grant execute on function private.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function private.set_member_can_add_expense(uuid, uuid, boolean) to authenticated;
grant execute on function private.remove_member(uuid, uuid) to authenticated;
grant execute on function private.leave_apartment(uuid) to authenticated;

-- RPC endpoints -------------------------------------------------------------------

create function public.set_member_role(p_apartment_id uuid, p_user_id uuid, p_role text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_member_role(p_apartment_id, p_user_id, p_role) $$;

create function public.set_member_can_add_expense(p_apartment_id uuid, p_user_id uuid, p_allowed boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_member_can_add_expense(p_apartment_id, p_user_id, p_allowed) $$;

create function public.remove_member(p_apartment_id uuid, p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_member(p_apartment_id, p_user_id) $$;

create function public.leave_apartment(p_apartment_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.leave_apartment(p_apartment_id) $$;

revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.set_member_can_add_expense(uuid, uuid, boolean) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_apartment(uuid) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_can_add_expense(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.leave_apartment(uuid) to authenticated;
