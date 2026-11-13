-- Expenses and the ledger (decision record 0003, SRS section 6).
--
-- An expense row carries its descriptive fields, its status and the number of
-- its current revision. The money lives in immutable revisions, payers and
-- splits, and in immutable ledger entries. Balances are always sums of ledger
-- entries; nothing stores a balance.

-- Rejects any change to rows that are part of financial history, whoever
-- tries, including the database owner.
create function private.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable_record' using errcode = 'P0001',
    detail = format('%s rows cannot be changed or deleted.', tg_table_name);
end;
$$;

revoke execute on function private.reject_change() from public;

-- Expenses ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  title text not null,
  description text,
  category_id uuid references public.expense_categories (id) on delete restrict,
  amount_minor bigint not null,
  currency text not null,
  expense_date date not null,
  due_date date,
  -- Unpaid: a bill owed to someone outside the apartment, such as a utility.
  -- It has no payers and creates no debts until a member pays it.
  paid_status text not null,
  status text not null default 'provisional',
  revision integer not null default 1,
  finalize_after timestamptz not null,
  finalized_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set by the app so that a retried request cannot create a second expense.
  client_request_id uuid,
  constraint expenses_title_valid check (char_length(title) between 1 and 100 and title = btrim(title)),
  constraint expenses_description_valid check (description is null or char_length(description) <= 1000),
  constraint expenses_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint expenses_paid_status_valid check (paid_status in ('paid', 'unpaid')),
  constraint expenses_status_valid check (status in ('provisional', 'disputed', 'final', 'void')),
  constraint expenses_revision_valid check (revision >= 1),
  constraint expenses_request_unique unique (apartment_id, client_request_id)
);

create index expenses_apartment_date on public.expenses (apartment_id, expense_date desc, created_at desc);
create index expenses_finalize_due on public.expenses (finalize_after) where status = 'provisional';

create trigger expenses_set_updated_at
before update on public.expenses
for each row
execute function private.set_updated_at();

-- One row per version of an expense's money.
create table public.expense_revisions (
  expense_id uuid not null references public.expenses (id) on delete restrict,
  revision integer not null,
  amount_minor bigint not null,
  split_method text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  reason text,
  primary key (expense_id, revision),
  constraint expense_revisions_amount_valid check (amount_minor > 0 and amount_minor <= 1000000000000),
  constraint expense_revisions_method_valid check (split_method in ('equal', 'percentage', 'fixed')),
  constraint expense_revisions_reason_valid check (reason is null or char_length(reason) <= 500)
);

create table public.expense_payers (
  expense_id uuid not null,
  revision integer not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  primary key (expense_id, revision, user_id),
  foreign key (expense_id, revision) references public.expense_revisions (expense_id, revision) on delete restrict,
  constraint expense_payers_amount_valid check (amount_minor > 0)
);

create table public.expense_splits (
  expense_id uuid not null,
  revision integer not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  -- The percentage asked for, for percentage splits.
  basis_points integer,
  primary key (expense_id, revision, user_id),
  foreign key (expense_id, revision) references public.expense_revisions (expense_id, revision) on delete restrict,
  constraint expense_splits_amount_valid check (amount_minor >= 0),
  constraint expense_splits_basis_points_valid check (basis_points is null or basis_points between 0 and 10000)
);

create index expense_splits_user on public.expense_splits (user_id);
create index expense_payers_user on public.expense_payers (user_id);

-- Ledger -----------------------------------------------------------------------------

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  kind text not null,
  debtor_id uuid not null references public.profiles (id) on delete restrict,
  creditor_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor bigint not null,
  expense_id uuid references public.expenses (id) on delete restrict,
  expense_revision integer,
  reverses_entry_id bigint references public.ledger_entries (id) on delete restrict,
  -- References added by the payments and offsets migrations.
  payment_id uuid,
  offset_id uuid,
  created_at timestamptz not null default now(),
  constraint ledger_entries_kind_valid check (kind in ('charge', 'charge_reversal', 'payment', 'offset')),
  constraint ledger_entries_amount_valid check (amount_minor > 0),
  constraint ledger_entries_two_people check (debtor_id <> creditor_id),
  constraint ledger_entries_expense_source check (
    (kind in ('charge', 'charge_reversal')) = (expense_id is not null and expense_revision is not null)
  ),
  constraint ledger_entries_reversal_source check ((kind = 'charge_reversal') = (reverses_entry_id is not null)),
  constraint ledger_entries_payment_source check ((kind = 'payment') = (payment_id is not null)),
  constraint ledger_entries_offset_source check ((kind = 'offset') = (offset_id is not null))
);

create index ledger_entries_pair on public.ledger_entries (apartment_id, debtor_id, creditor_id);
create index ledger_entries_creditor on public.ledger_entries (apartment_id, creditor_id);
create index ledger_entries_expense on public.ledger_entries (expense_id) where expense_id is not null;
-- A charge is reversed at most once.
create unique index ledger_entries_reversed_once on public.ledger_entries (reverses_entry_id)
where reverses_entry_id is not null;

comment on table public.ledger_entries is
  'Immutable debts between two members. Balances are sums of these; see decision record 0003.';

create trigger expense_revisions_immutable before update or delete on public.expense_revisions
for each row execute function private.reject_change();
create trigger expense_payers_immutable before update or delete on public.expense_payers
for each row execute function private.reject_change();
create trigger expense_splits_immutable before update or delete on public.expense_splits
for each row execute function private.reject_change();
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
for each row execute function private.reject_change();

-- The money of each expense's current revision.
create view public.expense_current_splits
with (security_invoker = true)
as
select s.expense_id, s.user_id, s.amount_minor, s.basis_points
from public.expense_splits s
join public.expenses e on e.id = s.expense_id and e.revision = s.revision;

create view public.expense_current_payers
with (security_invoker = true)
as
select p.expense_id, p.user_id, p.amount_minor
from public.expense_payers p
join public.expenses e on e.id = p.expense_id and e.revision = p.revision;

-- Visibility (SRS section 12, item 8) ---------------------------------------------------
-- Current members see every expense of their apartment. A former member sees
-- the expenses they paid for or shared in.

create function private.is_expense_party(target_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expense_splits
    where expense_id = target_expense and user_id = (select auth.uid())
  ) or exists (
    select 1 from public.expense_payers
    where expense_id = target_expense and user_id = (select auth.uid())
  );
$$;

create function private.can_view_expense(target_expense uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = target_expense
      and (private.is_active_member(e.apartment_id) or private.is_expense_party(e.id))
  );
$$;

revoke execute on function private.is_expense_party(uuid) from public;
revoke execute on function private.can_view_expense(uuid) from public;
grant execute on function private.is_expense_party(uuid) to authenticated;
grant execute on function private.can_view_expense(uuid) to authenticated;

alter table public.expenses enable row level security;
alter table public.expense_revisions enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.ledger_entries enable row level security;

revoke all on table public.expenses, public.expense_revisions, public.expense_payers,
  public.expense_splits, public.ledger_entries from anon, authenticated;
revoke all on table public.expense_current_splits, public.expense_current_payers from anon, authenticated;
grant select on table public.expenses, public.expense_revisions, public.expense_payers,
  public.expense_splits, public.ledger_entries to authenticated;
grant select on table public.expense_current_splits, public.expense_current_payers to authenticated;

create policy "Members and parties can read expenses"
on public.expenses
for select
to authenticated
using (
  (select private.is_active_member(apartment_id))
  or (select private.is_expense_party(id))
);

create policy "Readers of an expense can read its revisions"
on public.expense_revisions
for select
to authenticated
using ((select private.can_view_expense(expense_id)));

create policy "Readers of an expense can read its payers"
on public.expense_payers
for select
to authenticated
using ((select private.can_view_expense(expense_id)));

create policy "Readers of an expense can read its splits"
on public.expense_splits
for select
to authenticated
using ((select private.can_view_expense(expense_id)));

-- A debt is visible to the two people in it and to the apartment's admins.
-- Current members also see the charges behind expenses, which they can work
-- out from the expenses anyway; payments stay private to their parties.
create policy "Parties, admins and members can read ledger entries"
on public.ledger_entries
for select
to authenticated
using (
  debtor_id = (select auth.uid())
  or creditor_id = (select auth.uid())
  or (select private.is_apartment_admin(apartment_id))
  or (kind in ('charge', 'charge_reversal') and (select private.is_active_member(apartment_id)))
);
