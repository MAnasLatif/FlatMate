-- Apartments, their members and an activity log (SRS FR-02, FR-10.8).
--
-- The apartment is the isolation boundary: a user sees an apartment only
-- through a membership in it. Clients never write these tables directly; every
-- change goes through a function that checks who is calling.
--
-- Function pattern used from here on: the logic lives in a SECURITY DEFINER
-- function in the private schema, and a SECURITY INVOKER wrapper in public is
-- the RPC endpoint. Client roles can execute the private function only
-- because it is granted to them one by one, and only reach it through the
-- wrapper, since the private schema is not exposed by the Data API.

-- Row-level policies call helper functions in the private schema, so signed-in
-- users need to resolve names there. Postgres lets everyone execute a new
-- function, and a per-schema default cannot take that away, so every function
-- below revokes it explicitly and grants only what is needed.
grant usage on schema private to authenticated;

-- Tables ----------------------------------------------------------------------

create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  show_location boolean not null default false,
  -- One currency per apartment, fixed at creation (SRS section 12, item 7).
  currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  settlement_day smallint not null,
  approval_days smallint not null default 7,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apartments_name_valid check (char_length(name) between 1 and 80 and name = btrim(name)),
  constraint apartments_location_valid check (
    location is null or (char_length(location) between 1 and 120 and location = btrim(location))
  ),
  constraint apartments_currency_valid check (currency ~ '^[A-Z]{3}$'),
  constraint apartments_settlement_day_valid check (settlement_day between 1 and 31),
  constraint apartments_approval_days_valid check (approval_days between 1 and 30)
);

comment on table public.apartments is 'A shared flat. Every financial record belongs to exactly one.';

create trigger apartments_set_updated_at
before update on public.apartments
for each row
execute function private.set_updated_at();

-- One row per membership period: someone who leaves and rejoins gets a new
-- row, so earlier history keeps its dates (SRS FR-02.4, FR-02.5).
create table public.apartment_members (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  -- Restrict: financial history must survive, so a profile with memberships
  -- cannot be deleted out from under it.
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null default 'member',
  can_add_expense boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  constraint apartment_members_role_valid check (role in ('admin', 'member')),
  constraint apartment_members_left_valid check (
    (left_at is null and left_reason is null)
    or (left_at is not null and left_reason in ('left', 'removed') and left_at >= joined_at)
  )
);

create unique index apartment_members_one_active
on public.apartment_members (apartment_id, user_id)
where left_at is null;

create index apartment_members_user_active
on public.apartment_members (user_id)
where left_at is null;

-- Who did what, for the activity history (SRS FR-10.8). Written only by
-- functions, never edited.
create table public.audit_events (
  id bigint generated always as identity primary key,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_apartment_created
on public.audit_events (apartment_id, created_at desc);

-- Helpers for row-level policies ------------------------------------------------
-- They run as their owner so that checking membership does not itself depend
-- on the membership policies, and they only ever answer about the caller.

create function private.is_active_member(target_apartment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members m
    where m.apartment_id = target_apartment
      and m.user_id = (select auth.uid())
      and m.left_at is null
  );
$$;

create function private.is_apartment_admin(target_apartment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members m
    where m.apartment_id = target_apartment
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and m.role = 'admin'
  );
$$;

-- Current or former member: former members keep sight of the apartment their
-- records belong to (SRS section 12, item 8).
create function private.has_membership_history(target_apartment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apartment_members m
    where m.apartment_id = target_apartment
      and m.user_id = (select auth.uid())
  );
$$;

-- True when the caller and the other user have both been members of some
-- apartment, now or in the past.
create function private.shares_apartment_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.apartment_members mine
    join public.apartment_members theirs on theirs.apartment_id = mine.apartment_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke execute on function private.is_active_member(uuid) from public;
revoke execute on function private.is_apartment_admin(uuid) from public;
revoke execute on function private.has_membership_history(uuid) from public;
revoke execute on function private.shares_apartment_with(uuid) from public;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.is_apartment_admin(uuid) to authenticated;
grant execute on function private.has_membership_history(uuid) to authenticated;
grant execute on function private.shares_apartment_with(uuid) to authenticated;

-- Row-level security ------------------------------------------------------------

alter table public.apartments enable row level security;
alter table public.apartment_members enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.apartments, public.apartment_members, public.audit_events
from anon, authenticated;
grant select on table public.apartments, public.apartment_members, public.audit_events
to authenticated;

create policy "Members can read their apartments"
on public.apartments
for select
to authenticated
using ((select private.has_membership_history(id)));

-- Current members see everyone, including former members. Former members see
-- only their own membership rows.
create policy "Members can read memberships"
on public.apartment_members
for select
to authenticated
using (
  (select private.is_active_member(apartment_id))
  or user_id = (select auth.uid())
);

create policy "Members can read the activity history"
on public.audit_events
for select
to authenticated
using ((select private.is_active_member(apartment_id)));

-- One policy per action keeps evaluation to a single check per row, so the
-- own-profile policy from the profiles migration is folded into this one.
drop policy "Users can read their own profile" on public.profiles;

create policy "Users can read their own and their flatmates' profiles"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select private.shares_apartment_with(id))
);

-- Avatar folders are named after user ids, which the upload policy enforces.
-- The pattern check keeps the cast from failing on any other name.
drop policy "Users can read their own avatar" on storage.objects;

create policy "Users can read their own and their flatmates' avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (select private.shares_apartment_with(((storage.foldername(name))[1])::uuid))
      else false
    end
  )
);

-- Shared checks for functions -----------------------------------------------------

create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return current_user_id;
end;
$$;

create function private.require_admin(target_apartment uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := private.require_user();
begin
  if not private.is_apartment_admin(target_apartment) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return current_user_id;
end;
$$;

create function private.require_valid_timezone(timezone_name text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_name) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function private.require_user() from public;
revoke execute on function private.require_admin(uuid) from public;
revoke execute on function private.require_valid_timezone(text) from public;

-- Creating an apartment ------------------------------------------------------------

create function private.create_apartment(
  p_name text,
  p_location text,
  p_show_location boolean,
  p_currency text,
  p_timezone text,
  p_settlement_day integer,
  p_approval_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator uuid := private.require_user();
  new_apartment uuid;
begin
  perform private.require_valid_timezone(p_timezone);

  insert into public.apartments (
    name, location, show_location, currency, timezone, settlement_day, approval_days, created_by
  )
  values (
    btrim(p_name),
    nullif(btrim(p_location), ''),
    coalesce(p_show_location, false),
    upper(btrim(p_currency)),
    p_timezone,
    p_settlement_day,
    p_approval_days,
    creator
  )
  returning id into new_apartment;

  insert into public.apartment_members (apartment_id, user_id, role)
  values (new_apartment, creator, 'admin');

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (new_apartment, creator, 'apartment', new_apartment, 'created');

  return new_apartment;
end;
$$;

revoke execute on function private.create_apartment(text, text, boolean, text, text, integer, integer)
from public;
grant execute on function private.create_apartment(text, text, boolean, text, text, integer, integer)
to authenticated;

create function public.create_apartment(
  p_name text,
  p_settlement_day integer,
  p_location text default null,
  p_show_location boolean default false,
  p_currency text default 'PKR',
  p_timezone text default 'Asia/Karachi',
  p_approval_days integer default 7
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_apartment(
    p_name, p_location, p_show_location, p_currency, p_timezone, p_settlement_day, p_approval_days
  );
$$;

revoke execute on function public.create_apartment(text, integer, text, boolean, text, text, integer)
from public, anon;
grant execute on function public.create_apartment(text, integer, text, boolean, text, text, integer)
to authenticated;
