-- One join code per apartment (SRS FR-02.1, FR-02.2; decided 2026-11-17).
--
-- Admins found several codes, each with its own expiry, hard to follow. Each
-- apartment now has one code at a time. It does not expire: an admin shares
-- the same code by copying, sharing or emailing it, and changes it when it
-- should stop working. Joining with a code only asks to join, an admin still
-- approves every request, and wrong guesses stay rate-limited, so a code that
-- lasts is safe enough.
--
-- The code is a row of apartment_invites that never expires ('infinity').
-- create_invite stays for app versions that still call it; codes it made keep
-- working until they expire or the code is changed.

-- Makes a new code that never expires and returns it as XXXX-XXXX. The caller
-- is an admin and holds the apartment's lock.
create function private.issue_join_code(p_apartment_id uuid, p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
  shown text;
  new_invite uuid;
begin
  loop
    new_code := private.generate_invite_code();
    shown := substr(new_code, 1, 4) || '-' || substr(new_code, 5, 4);
    begin
      insert into public.apartment_invites (apartment_id, code_hash, code, created_by, expires_at)
      values (p_apartment_id, private.hash_invite_code(new_code), shown, p_admin_id, 'infinity')
      returning id into new_invite;
      exit;
    exception when unique_violation then
      -- Another code already has this hash; draw again.
    end;
  end loop;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, p_admin_id, 'invite', new_invite, 'created');

  return shown;
end;
$$;

-- The apartment's code: the working code admins can read, making one the
-- first time. Locking the apartment means two admins asking at once get the
-- same code.
create function private.apartment_join_code(p_apartment_id uuid, p_admin_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_code text;
begin
  perform 1 from public.apartments where id = p_apartment_id for update;

  select i.code into current_code
  from public.apartment_invites i
  where i.apartment_id = p_apartment_id
    and i.revoked_at is null
    and i.expires_at > now()
    and i.code is not null
  order by i.expires_at desc, i.created_at desc
  limit 1;

  return coalesce(current_code, private.issue_join_code(p_apartment_id, p_admin_id));
end;
$$;

create function private.get_join_code(p_apartment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
begin
  return private.apartment_join_code(p_apartment_id, admin_id);
end;
$$;

-- Replaces the code: every code that still works stops working, including
-- older ones, and a new one is made.
create function private.change_join_code(p_apartment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
begin
  perform 1 from public.apartments where id = p_apartment_id for update;

  with revoked as (
    update public.apartment_invites
    set revoked_at = now()
    where apartment_id = p_apartment_id and revoked_at is null and expires_at > now()
    returning id
  )
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  select p_apartment_id, admin_id, 'invite', revoked.id, 'revoked' from revoked;

  return private.issue_join_code(p_apartment_id, admin_id);
end;
$$;

revoke execute on function private.issue_join_code(uuid, uuid) from public;
revoke execute on function private.apartment_join_code(uuid, uuid) from public;
revoke execute on function private.get_join_code(uuid) from public;
revoke execute on function private.change_join_code(uuid) from public;
grant execute on function private.get_join_code(uuid) to authenticated;
grant execute on function private.change_join_code(uuid) to authenticated;

create function public.get_join_code(p_apartment_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.get_join_code(p_apartment_id) $$;

create function public.change_join_code(p_apartment_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.change_join_code(p_apartment_id) $$;

revoke execute on function public.get_join_code(uuid) from public, anon;
revoke execute on function public.change_join_code(uuid) from public, anon;
grant execute on function public.get_join_code(uuid) to authenticated;
grant execute on function public.change_join_code(uuid) to authenticated;

-- Emailing an invite sends the apartment's code instead of making a new one.
-- As in 20261117100000_show_join_codes_to_admins.sql otherwise; the email no
-- longer says how long the code works, since it lasts until it is changed.
create or replace function private.prepare_invite_email(p_apartment_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  email text := lower(btrim(coalesce(p_email, '')));
  recipient text;
begin
  -- A plain shape check: the email provider is the real test of an address.
  if length(email) > 254 or email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  recipient := encode(extensions.digest(email, 'sha256'), 'hex');

  -- Limits against using FlatMate to send mail: 20 emails a day from one
  -- admin, and 3 a day to one address from one apartment.
  if (
    select count(*) from private.invite_emails
    where sent_by = admin_id and created_at > now() - interval '24 hours'
  ) >= 20 or (
    select count(*) from private.invite_emails
    where apartment_id = p_apartment_id
      and recipient_hash = recipient
      and created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into private.invite_emails (apartment_id, sent_by, recipient_hash)
  values (p_apartment_id, admin_id, recipient);

  return jsonb_build_object(
    'code', private.apartment_join_code(p_apartment_id, admin_id),
    'apartment_name', (select a.name from public.apartments a where a.id = p_apartment_id),
    'inviter_name', (select p.display_name from public.profiles p where p.id = admin_id)
  );
end;
$$;
