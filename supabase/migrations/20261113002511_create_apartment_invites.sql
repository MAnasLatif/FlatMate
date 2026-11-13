-- Join codes (SRS FR-02.2).
--
-- An admin creates a code and shares it; anyone signed in can join with it
-- until it expires or is revoked. Only a hash of the code is stored, so the
-- code is shown once, when it is created. Wrong guesses are rate-limited per
-- user.

create table public.apartment_invites (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  code_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint apartment_invites_expiry_valid check (expires_at > created_at)
);

create index apartment_invites_apartment on public.apartment_invites (apartment_id);

alter table public.apartment_invites enable row level security;

revoke all on table public.apartment_invites from anon, authenticated;
-- Everything except the hash, which is useless to clients and only helps guessing.
grant select (id, apartment_id, created_by, created_at, expires_at, revoked_at)
on table public.apartment_invites to authenticated;

create policy "Admins can read their apartment's invites"
on public.apartment_invites
for select
to authenticated
using ((select private.is_apartment_admin(apartment_id)));

-- Join attempts, for rate limiting. Not exposed in any way.
create table private.join_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null
);

create index join_attempts_user_time on private.join_attempts (user_id, attempted_at desc);

-- Codes ---------------------------------------------------------------------------

-- Crockford's Base32: 32 characters chosen for codes people type. 8 characters
-- give about 1.1 trillion codes.
--
-- Upper case and separators removed, and the look-alikes O, I and L read as
-- 0, 1 and 1: "abcd-2345", "ABCD2345" and "ABCD 2345" are the same code.
create function private.normalize_invite_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')), 'OIL', '011')
$$;

create function private.hash_invite_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(private.normalize_invite_code(code), 'sha256'), 'hex') $$;

create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
  position integer;
begin
  -- Each byte picks one of 32 characters; 256 is a multiple of 32, so every
  -- character is equally likely.
  for position in 0..7 loop
    code := code || substr(alphabet, (get_byte(random_bytes, position) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

revoke execute on function private.normalize_invite_code(text) from public;
revoke execute on function private.hash_invite_code(text) from public;
revoke execute on function private.generate_invite_code() from public;

-- Creating and revoking codes ---------------------------------------------------

create function private.create_invite(p_apartment_id uuid, p_valid_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := private.require_admin(p_apartment_id);
  code text;
  new_invite uuid;
begin
  if p_valid_days is null or p_valid_days not between 1 and 30 then
    raise exception 'invalid_validity' using errcode = '22023';
  end if;

  loop
    code := private.generate_invite_code();
    begin
      insert into public.apartment_invites (apartment_id, code_hash, created_by, expires_at)
      values (p_apartment_id, private.hash_invite_code(code), admin_id, now() + make_interval(days => p_valid_days))
      returning id into new_invite;
      exit;
    exception when unique_violation then
      -- Another code already has this hash; draw again.
    end;
  end loop;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (p_apartment_id, admin_id, 'invite', new_invite, 'created', jsonb_build_object('valid_days', p_valid_days));

  return substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

create function private.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_apartment uuid;
  admin_id uuid;
begin
  select apartment_id into invite_apartment from public.apartment_invites where id = p_invite_id;
  if invite_apartment is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  admin_id := private.require_admin(invite_apartment);

  update public.apartment_invites
  set revoked_at = now()
  where id = p_invite_id and revoked_at is null;

  if found then
    insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
    values (invite_apartment, admin_id, 'invite', p_invite_id, 'revoked');
  end if;
end;
$$;

-- Joining -------------------------------------------------------------------------

-- Returns a status instead of raising for expected outcomes, so that failed
-- attempts are recorded for rate limiting (an error would roll them back).
-- status: joined, already_member, invalid_code or rate_limited.
create function private.join_apartment(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  joiner uuid := private.require_user();
  recent_failures integer;
  invite record;
begin
  select count(*) into recent_failures
  from private.join_attempts
  where user_id = joiner
    and not succeeded
    and attempted_at > now() - interval '15 minutes';

  if recent_failures >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select i.id, i.apartment_id into invite
  from public.apartment_invites i
  where i.code_hash = private.hash_invite_code(p_code)
    and i.revoked_at is null
    and i.expires_at > now();

  if invite.id is null then
    insert into private.join_attempts (user_id, succeeded) values (joiner, false);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  insert into private.join_attempts (user_id, succeeded) values (joiner, true);

  if exists (
    select 1 from public.apartment_members
    where apartment_id = invite.apartment_id and user_id = joiner and left_at is null
  ) then
    return jsonb_build_object('status', 'already_member', 'apartment_id', invite.apartment_id);
  end if;

  insert into public.apartment_members (apartment_id, user_id, role)
  values (invite.apartment_id, joiner, 'member');

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (invite.apartment_id, joiner, 'member', joiner, 'joined', jsonb_build_object('invite_id', invite.id));

  return jsonb_build_object('status', 'joined', 'apartment_id', invite.apartment_id);
end;
$$;

revoke execute on function private.create_invite(uuid, integer) from public;
revoke execute on function private.revoke_invite(uuid) from public;
revoke execute on function private.join_apartment(text) from public;
grant execute on function private.create_invite(uuid, integer) to authenticated;
grant execute on function private.revoke_invite(uuid) to authenticated;
grant execute on function private.join_apartment(text) to authenticated;

-- RPC endpoints -------------------------------------------------------------------

create function public.create_invite(p_apartment_id uuid, p_valid_days integer default 7)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.create_invite(p_apartment_id, p_valid_days) $$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.revoke_invite(p_invite_id) $$;

create function public.join_apartment(p_code text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.join_apartment(p_code) $$;

revoke execute on function public.create_invite(uuid, integer) from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
revoke execute on function public.join_apartment(text) from public, anon;
grant execute on function public.create_invite(uuid, integer) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.join_apartment(text) to authenticated;
