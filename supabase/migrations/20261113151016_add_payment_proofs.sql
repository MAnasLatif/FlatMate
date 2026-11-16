-- Proof of a payment (SRS FR-07.3, FR-07.5).
--
-- The payer can attach photos, such as a bank app screenshot, to a payment
-- they recorded. They live in a private bucket under <apartment id>/<payment
-- id>/, are seen by whoever can see the payment, and are never replaced or
-- deleted: a declined payment keeps its evidence. A proof is the payer's
-- claim; nothing in FlatMate verifies a transfer.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create table public.payment_attachments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  storage_path text not null unique,
  content_type text not null,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payment_attachments_type_valid check (content_type in ('image/jpeg', 'image/png', 'image/webp'))
);

create index payment_attachments_payment on public.payment_attachments (payment_id);
create index payment_attachments_uploaded_by on public.payment_attachments (uploaded_by);

create trigger payment_attachments_immutable before update or delete on public.payment_attachments
for each row execute function private.reject_change();

alter table public.payment_attachments enable row level security;
revoke all on table public.payment_attachments from anon, authenticated;
grant select on table public.payment_attachments to authenticated;

create policy "People who can see a payment can see its proof"
on public.payment_attachments
for select
to authenticated
using ((select private.can_view_payment(payment_id)));

-- The folders of a proof path, checked to be ids before they are used.
create function private.proof_path_ids(path text)
returns table (apartment_id uuid, payment_id uuid)
language sql
immutable
set search_path = ''
as $$
  select parts[1]::uuid, parts[2]::uuid
  from (select string_to_array(path, '/') as parts) split
  where array_length(parts, 1) = 3
    and parts[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and parts[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and parts[3] <> ''
$$;

-- Only the payer adds proof, to a payment that is not void.
create function private.can_upload_proof(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.proof_path_ids(path) ids
    join public.payments p on p.id = ids.payment_id and p.apartment_id = ids.apartment_id
    where p.payer_id = (select auth.uid()) and p.status <> 'void'
  );
$$;

create function private.can_view_proof(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.proof_path_ids(path) ids
    join public.payments p on p.id = ids.payment_id and p.apartment_id = ids.apartment_id
    where private.can_view_payment(p.id)
  );
$$;

revoke execute on function private.proof_path_ids(text) from public;
revoke execute on function private.can_upload_proof(text) from public;
revoke execute on function private.can_view_proof(text) from public;
grant execute on function private.can_upload_proof(text) to authenticated;
grant execute on function private.can_view_proof(text) to authenticated;

-- Insert only: with no update or delete policy, files cannot be replaced or removed.
create policy "Payers can upload proof of their payments"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'payment-proofs' and (select private.can_upload_proof(name)));

create policy "People who can see a payment can see its proof"
on storage.objects
for select
to authenticated
using (bucket_id = 'payment-proofs' and (select private.can_view_proof(name)));

-- Registers an uploaded file as proof of its payment. The file must exist and
-- have been uploaded by the caller. Registering it twice returns the same
-- attachment, so a retried request is safe.
create function private.add_payment_proof(p_payment_id uuid, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uploader uuid := private.require_user();
  payment public.payments;
  stored record;
  attachment uuid;
begin
  select * into payment from public.payments where id = p_payment_id;
  if payment.id is null or not private.can_view_payment(payment.id) then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from private.proof_path_ids(p_storage_path) ids
    where ids.apartment_id = payment.apartment_id and ids.payment_id = payment.id
  ) then
    raise exception 'invalid_proof_path' using errcode = '22023';
  end if;

  select id into attachment from public.payment_attachments where storage_path = p_storage_path;
  if attachment is not null then
    return attachment;
  end if;
  if payment.payer_id <> uploader or payment.status = 'void' then
    raise exception 'not_allowed_to_add_proof' using errcode = '42501';
  end if;

  select o.owner_id, o.metadata ->> 'mimetype' as mime_type into stored
  from storage.objects o
  where o.bucket_id = 'payment-proofs' and o.name = p_storage_path;
  if stored.owner_id is null or stored.owner_id <> uploader::text then
    raise exception 'proof_not_uploaded' using errcode = '22023';
  end if;

  insert into public.payment_attachments (payment_id, storage_path, content_type, uploaded_by)
  values (payment.id, p_storage_path, coalesce(stored.mime_type, 'image/jpeg'), uploader)
  returning id into attachment;
  return attachment;
end;
$$;

revoke execute on function private.add_payment_proof(uuid, text) from public;
grant execute on function private.add_payment_proof(uuid, text) to authenticated;

create function public.add_payment_proof(p_payment_id uuid, p_storage_path text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.add_payment_proof(p_payment_id, p_storage_path) $$;

revoke execute on function public.add_payment_proof(uuid, text) from public, anon;
grant execute on function public.add_payment_proof(uuid, text) to authenticated;
