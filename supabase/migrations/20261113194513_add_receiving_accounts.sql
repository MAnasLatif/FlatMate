-- Receiving accounts (SRS FR-01.3, FR-01.4, FR-07.2, AC-12, section 12 item 6).
--
-- The bank and wallet accounts a member can be paid into. They belong to the
-- user, not to an apartment, and are private: the owner shares each account
-- with specific apartments, and only current members of those apartments see
-- it, through get_shared_accounts. FlatMate only shows the details so a
-- flatmate can pay outside the app; it never asks for passwords, PINs or OTPs,
-- and account details are never written to logs or notifications.

create table public.receiving_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  -- The bank or wallet, such as "Meezan Bank" or "JazzCash".
  provider text not null,
  account_title text not null,
  -- An account number, IBAN or wallet number.
  account_identifier text not null,
  is_preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receiving_accounts_kind_valid check (kind in ('bank', 'wallet')),
  constraint receiving_accounts_provider_valid check (char_length(provider) between 1 and 60 and provider = btrim(provider)),
  constraint receiving_accounts_title_valid check (char_length(account_title) between 1 and 100 and account_title = btrim(account_title)),
  constraint receiving_accounts_identifier_valid check (account_identifier ~ '^[A-Za-z0-9][A-Za-z0-9 -]{3,40}$')
);

create index receiving_accounts_user on public.receiving_accounts (user_id);
-- At most one preferred account per person.
create unique index receiving_accounts_one_preferred on public.receiving_accounts (user_id) where is_preferred;

create trigger receiving_accounts_set_updated_at before update on public.receiving_accounts
for each row execute function private.set_updated_at();

create table public.receiving_account_shares (
  account_id uuid not null references public.receiving_accounts (id) on delete cascade,
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, apartment_id)
);

create index receiving_account_shares_apartment on public.receiving_account_shares (apartment_id);

alter table public.receiving_accounts enable row level security;
alter table public.receiving_account_shares enable row level security;
revoke all on table public.receiving_accounts, public.receiving_account_shares from anon, authenticated;
grant select, insert, update, delete on table public.receiving_accounts to authenticated;
grant select, insert, delete on table public.receiving_account_shares to authenticated;

-- Only the owner reads and changes their accounts directly. Flatmates see
-- shared ones through get_shared_accounts, which checks membership.
create policy "Owners manage their receiving accounts"
on public.receiving_accounts
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create function private.owns_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.receiving_accounts where id = p_account_id and user_id = (select auth.uid()));
$$;

revoke execute on function private.owns_account(uuid) from public;
grant execute on function private.owns_account(uuid) to authenticated;

-- The owner shares an account only with an apartment they are a current member of.
create policy "Owners see their shares"
on public.receiving_account_shares
for select
to authenticated
using ((select private.owns_account(account_id)));

create policy "Owners share with their apartments"
on public.receiving_account_shares
for insert
to authenticated
with check ((select private.owns_account(account_id)) and (select private.is_active_member(apartment_id)));

create policy "Owners stop sharing"
on public.receiving_account_shares
for delete
to authenticated
using ((select private.owns_account(account_id)));

-- The accounts p_user_id shares with p_apartment_id, for a current member of
-- that apartment. The owner's own accounts are read from the table instead.
create function private.shared_accounts(p_apartment_id uuid, p_user_id uuid)
returns table (
  id uuid,
  kind text,
  provider text,
  account_title text,
  account_identifier text,
  is_preferred boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    return;
  end if;
  return query
  select a.id, a.kind, a.provider, a.account_title, a.account_identifier, a.is_preferred
  from public.receiving_account_shares s
  join public.receiving_accounts a on a.id = s.account_id
  where s.apartment_id = p_apartment_id
    and a.user_id = p_user_id
    and exists (
      select 1 from public.apartment_members m
      where m.apartment_id = p_apartment_id and m.user_id = p_user_id
    )
  order by a.is_preferred desc, a.created_at;
end;
$$;

revoke execute on function private.shared_accounts(uuid, uuid) from public;
grant execute on function private.shared_accounts(uuid, uuid) to authenticated;

create function public.get_shared_accounts(p_apartment_id uuid, p_user_id uuid)
returns table (
  id uuid,
  kind text,
  provider text,
  account_title text,
  account_identifier text,
  is_preferred boolean
)
language sql
security invoker
set search_path = ''
as $$ select * from private.shared_accounts(p_apartment_id, p_user_id) $$;

revoke execute on function public.get_shared_accounts(uuid, uuid) from public, anon;
grant execute on function public.get_shared_accounts(uuid, uuid) to authenticated;
