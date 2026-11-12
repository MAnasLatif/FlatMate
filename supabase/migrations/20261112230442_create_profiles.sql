-- Profiles: the app-facing record for each Supabase Auth user (SRS FR-01.2).
--
-- A profile is created automatically when a user signs up. Users can read and
-- rename their own profile. Flatmates gain read access to each other's
-- profiles when apartment membership exists (task 1.6).

-- Helper functions that must not be reachable through the Data API live in a
-- schema that is not exposed and grants nothing to client roles.
create schema if not exists private;
revoke all on schema private from public;

-- Keeps updated_at current on every update.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Null until the user chooses a name; the app asks for one when it is missing.
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_valid check (
    display_name is null
    or (char_length(display_name) between 1 and 80 and display_name = btrim(display_name))
  )
);

comment on table public.profiles is 'One row per Supabase Auth user, created at sign-up.';

alter table public.profiles enable row level security;

-- Least privilege: signed-out requests get nothing, signed-in users may read
-- rows and change only their display name. Row-level policies below decide
-- which rows.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

-- Creates the profile when Supabase Auth creates a user. It runs as its owner
-- because the inserting role (Supabase Auth) has no rights on public.profiles.
--
-- If this function raises an error, the sign-up fails, so the name taken from
-- the sign-up metadata is always reduced to a value the check constraint
-- accepts, or to null. The metadata is user-supplied and is used only as an
-- initial display name, never for authorization.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_name text;
begin
  initial_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  );
  initial_name := nullif(btrim(left(initial_name, 80)), '');

  insert into public.profiles (id, display_name)
  values (new.id, initial_name);

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();
