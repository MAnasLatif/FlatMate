-- A payment can say which of the recipient's bank or wallet accounts the money
-- was sent to. The payer chooses it from the accounts shared with the apartment,
-- or leaves it out (cash, or an account that was never shared).
--
-- The payment keeps a snapshot of the account as it was: its provider, title
-- and masked number. Financial history is never rewritten, so editing or
-- deleting the account later does not change what an old payment shows. The
-- link itself is cleared when the account is deleted.

alter table public.payments
  add column receiving_account_id uuid references public.receiving_accounts (id) on delete set null,
  add column paid_to_provider text,
  add column paid_to_title text,
  add column paid_to_identifier_masked text,
  -- The snapshot is all or nothing.
  add constraint payments_paid_to_snapshot_complete check (
    num_nulls(paid_to_provider, paid_to_title, paid_to_identifier_masked) in (0, 3)
  ),
  -- A linked account always has its snapshot; the link alone may be cleared.
  add constraint payments_paid_to_account_has_snapshot check (
    receiving_account_id is null or paid_to_provider is not null
  );

-- The account's details screen lists the payments made to it.
create index payments_receiving_account on public.payments (receiving_account_id, paid_at desc)
where receiving_account_id is not null;

-- The same masking as the app (app/src/features/accounts/rules.ts): spaces and
-- dashes removed, then only the last four characters.
create function private.mask_identifier(p_identifier text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(compact) <= 4 then compact
    else '•••• ' || right(compact, 4)
  end
  from (select regexp_replace(p_identifier, '[\s-]', '', 'g') as compact) as cleaned
$$;

revoke execute on function private.mask_identifier(text) from public;

-- record_payment gains an optional account. The old seven-argument functions
-- are replaced, and the new argument defaults to null, so an app that does not
-- send it keeps working.
drop function public.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid);
drop function private.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid);

create function private.record_payment(
  p_apartment_id uuid,
  p_recipient_id uuid,
  p_amount_minor bigint,
  p_paid_at timestamptz,
  p_reference text,
  p_expense_id uuid,
  p_client_request_id uuid,
  p_receiving_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payer uuid := private.require_user();
  apartment public.apartments;
  account public.receiving_accounts;
  existing uuid;
  reference text := nullif(btrim(p_reference), '');
  paid_at timestamptz := coalesce(p_paid_at, now());
  payable bigint;
  new_payment uuid;
begin
  -- Former members can still pay what they owe (SRS FR-02.4).
  if not private.has_membership_history(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if p_client_request_id is not null then
    select id into existing from public.payments
    where apartment_id = p_apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if p_recipient_id = payer then
    raise exception 'cannot_pay_yourself' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.apartment_members where apartment_id = p_apartment_id and user_id = p_recipient_id
  ) then
    raise exception 'recipient_not_member' using errcode = '22023';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if paid_at > now() + interval '5 minutes' then
    raise exception 'paid_at_in_future' using errcode = '22023';
  end if;
  if reference is not null and char_length(reference) > 100 then
    raise exception 'reference_too_long' using errcode = '22023';
  end if;
  if p_expense_id is not null and not exists (
    select 1 from public.expenses where id = p_expense_id and apartment_id = p_apartment_id
  ) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  -- Only an account the recipient shares with this apartment, which is what
  -- the payer was shown (FR-07.2). Anything else is refused the same way, so
  -- the error reveals nothing about other people's private accounts.
  if p_receiving_account_id is not null then
    select a.* into account
    from public.receiving_accounts as a
    join public.receiving_account_shares as s
      on s.account_id = a.id and s.apartment_id = p_apartment_id
    where a.id = p_receiving_account_id and a.user_id = p_recipient_id;
    if account.id is null then
      raise exception 'account_not_shared' using errcode = '22023';
    end if;
  end if;

  perform private.lock_pair(p_apartment_id, payer, p_recipient_id);
  payable := private.pair_payable(p_apartment_id, payer, p_recipient_id);
  if p_amount_minor > payable then
    raise exception 'payment_exceeds_debt' using errcode = '22023';
  end if;

  select * into apartment from public.apartments where id = p_apartment_id;
  insert into public.payments (
    apartment_id, payer_id, recipient_id, amount_minor, currency, paid_at, reference,
    finalize_after, expense_id, client_request_id,
    receiving_account_id, paid_to_provider, paid_to_title, paid_to_identifier_masked
  )
  values (
    p_apartment_id, payer, p_recipient_id, p_amount_minor, apartment.currency, paid_at, reference,
    now() + make_interval(days => apartment.approval_days), p_expense_id, p_client_request_id,
    account.id, account.provider, account.account_title,
    case when account.id is null then null else private.mask_identifier(account.account_identifier) end
  )
  returning id into new_payment;

  insert into public.ledger_entries (apartment_id, kind, debtor_id, creditor_id, amount_minor, payment_id)
  values (p_apartment_id, 'payment', payer, p_recipient_id, p_amount_minor, new_payment);

  -- Who paid whom how much is private to the two of them, so the log only notes the record.
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
  values (p_apartment_id, payer, 'payment', new_payment, 'recorded');

  return new_payment;
end;
$$;

revoke execute on function private.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid, uuid) from public;
grant execute on function private.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid, uuid) to authenticated;

create function public.record_payment(
  p_apartment_id uuid,
  p_recipient_id uuid,
  p_amount_minor bigint,
  p_paid_at timestamptz default null,
  p_reference text default null,
  p_expense_id uuid default null,
  p_client_request_id uuid default null,
  p_receiving_account_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_payment(
    p_apartment_id, p_recipient_id, p_amount_minor, p_paid_at, p_reference, p_expense_id,
    p_client_request_id, p_receiving_account_id
  )
$$;

revoke execute on function public.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_payment(uuid, uuid, bigint, timestamptz, text, uuid, uuid, uuid) to authenticated;
