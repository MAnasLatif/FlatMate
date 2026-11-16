-- Invites sent by email (SRS FR-02.2, decision 0010).
--
-- An admin types an address in the app; the send-invite-email Edge Function
-- calls private.prepare_invite_email as that admin, then emails the join code
-- it returns. The database decides who may send, checks the address, limits
-- how many emails go out and creates the code. The address itself is never
-- stored: only a hash, to limit emails to the same person.

-- One row per email asked for, for rate limiting. Not exposed in any way.
create table private.invite_emails (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  sent_by uuid not null,
  recipient_hash text not null,
  created_at timestamptz not null default now()
);

create index invite_emails_sender_time on private.invite_emails (sent_by, created_at desc);
create index invite_emails_recipient_time
on private.invite_emails (apartment_id, recipient_hash, created_at desc);

alter table private.invite_emails enable row level security;
revoke all on table private.invite_emails from public, anon, authenticated;

-- Checks and records one invite email, and creates its join code.
-- Raises not_admin, invalid_email or rate_limited. Returns the code and what
-- the email says: the apartment's name, the inviter's name and how long the
-- code works.
create function private.prepare_invite_email(p_apartment_id uuid, p_email text)
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
  code text;
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

  code := private.create_invite(p_apartment_id, valid_days);
  select i.id into invite_id
  from public.apartment_invites i
  where i.code_hash = private.hash_invite_code(code);

  return jsonb_build_object(
    'code', code,
    'invite_id', invite_id,
    'valid_days', valid_days,
    'apartment_name', (select a.name from public.apartments a where a.id = p_apartment_id),
    'inviter_name', (select p.display_name from public.profiles p where p.id = admin_id)
  );
end;
$$;

revoke execute on function private.prepare_invite_email(uuid, text) from public;
grant execute on function private.prepare_invite_email(uuid, text) to authenticated;

-- RPC endpoint, called by the send-invite-email Edge Function with the
-- admin's own token. An admin calling it directly only gets a join code,
-- which create_invite already gives them, and uses up their daily limit.
create function public.prepare_invite_email(p_apartment_id uuid, p_email text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.prepare_invite_email(p_apartment_id, p_email) $$;

revoke execute on function public.prepare_invite_email(uuid, text) from public, anon;
grant execute on function public.prepare_invite_email(uuid, text) to authenticated;
