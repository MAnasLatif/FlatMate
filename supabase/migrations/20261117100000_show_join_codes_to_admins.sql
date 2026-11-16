-- Admins see the join codes that still work (decided 2026-11-17).
--
-- Until now only a hash of each code was kept, so a code was shown once, when
-- it was created. Admins now see each working code in the settings, so new
-- codes also keep the code itself. Only the apartment's admins can read it,
-- through the existing policy on apartment_invites. A code works for at most
-- 30 days and joining still needs an admin's approval, which keeps the risk
-- of a readable code small. Joining still matches on the hash. Codes made
-- before this migration have no readable code and stay hidden.

alter table public.apartment_invites
  add column code text,
  add constraint apartment_invites_code_valid check (code is null or code ~ '^[0-9A-Z]{4}-[0-9A-Z]{4}$');

grant select (code) on table public.apartment_invites to authenticated;

-- As in 20261113002511_create_apartment_invites.sql, keeping the code as well.
-- The variable is new_code, since "code" now also names a column.
create or replace function private.create_invite(p_apartment_id uuid, p_valid_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  new_code text;
  shown text;
  new_invite uuid;
begin
  if p_valid_days is null or p_valid_days not between 1 and 30 then
    raise exception 'invalid_validity' using errcode = '22023';
  end if;

  loop
    new_code := private.generate_invite_code();
    shown := substr(new_code, 1, 4) || '-' || substr(new_code, 5, 4);
    begin
      insert into public.apartment_invites (apartment_id, code_hash, code, created_by, expires_at)
      values (
        p_apartment_id, private.hash_invite_code(new_code), shown, admin_id,
        now() + make_interval(days => p_valid_days)
      )
      returning id into new_invite;
      exit;
    exception when unique_violation then
      -- Another code already has this hash; draw again.
    end;
  end loop;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'invite', new_invite, 'created', jsonb_build_object('valid_days', p_valid_days));

  return shown;
end;
$$;

-- As in 20261116103827_add_invite_emails.sql, with the variable renamed for
-- the same reason.
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
  -- As long as a shared code works by default.
  valid_days constant integer := 7;
  new_code text;
  invite_id uuid;
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

  new_code := private.create_invite(p_apartment_id, valid_days);
  select i.id into invite_id
  from public.apartment_invites i
  where i.code_hash = private.hash_invite_code(new_code);

  return jsonb_build_object(
    'code', new_code,
    'invite_id', invite_id,
    'valid_days', valid_days,
    'apartment_name', (select a.name from public.apartments a where a.id = p_apartment_id),
    'inviter_name', (select p.display_name from public.profiles p where p.id = admin_id)
  );
end;
$$;
