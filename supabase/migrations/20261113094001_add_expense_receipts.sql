-- Receipts (SRS FR-03.1, FR-03.6, AC-12).
--
-- Receipt images live in a private bucket under <apartment id>/<expense id>/.
-- They are evidence, so they are never replaced or deleted. Anyone who can
-- see the expense can see its receipts, through signed links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create table public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete restrict,
  storage_path text not null unique,
  content_type text not null,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint expense_attachments_type_valid check (content_type in ('image/jpeg', 'image/png', 'image/webp'))
);

create index expense_attachments_expense on public.expense_attachments (expense_id);

create trigger expense_attachments_immutable before update or delete on public.expense_attachments
for each row execute function private.reject_change();

alter table public.expense_attachments enable row level security;
revoke all on table public.expense_attachments from anon, authenticated;
grant select on table public.expense_attachments to authenticated;

create policy "Readers of an expense can read its receipts"
on public.expense_attachments
for select
to authenticated
using ((select private.can_view_expense(expense_id)));

-- The folders of a receipt path, checked to be ids before they are used.
create function private.receipt_path_ids(path text)
returns table (apartment_id uuid, expense_id uuid)
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

-- A current member may upload a receipt for an expense of their apartment.
create function private.can_upload_receipt(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.receipt_path_ids(path) ids
    join public.expenses e on e.id = ids.expense_id and e.apartment_id = ids.apartment_id
    where private.is_active_member(e.apartment_id)
  );
$$;

create function private.can_view_receipt(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.receipt_path_ids(path) ids
    where private.can_view_expense(ids.expense_id)
  );
$$;

revoke execute on function private.receipt_path_ids(text) from public;
revoke execute on function private.can_upload_receipt(text) from public;
revoke execute on function private.can_view_receipt(text) from public;
grant execute on function private.can_upload_receipt(text) to authenticated;
grant execute on function private.can_view_receipt(text) to authenticated;

-- Uploading is insert only: no update or delete policy, so files cannot be
-- replaced or removed through the API.
create policy "Members can upload receipts"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'receipts' and (select private.can_upload_receipt(name)));

create policy "Readers of an expense can read its receipts"
on storage.objects
for select
to authenticated
using (bucket_id = 'receipts' and (select private.can_view_receipt(name)));

-- Registers an uploaded file as a receipt of its expense. The file must exist
-- and have been uploaded by the caller.
create function private.add_expense_attachment(p_expense_id uuid, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uploader uuid := private.require_user();
  expense_apartment uuid;
  stored record;
  new_attachment uuid;
begin
  select apartment_id into expense_apartment from public.expenses where id = p_expense_id;
  if expense_apartment is null or not private.is_active_member(expense_apartment) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from private.receipt_path_ids(p_storage_path) ids
    where ids.apartment_id = expense_apartment and ids.expense_id = p_expense_id
  ) then
    raise exception 'invalid_receipt_path' using errcode = '22023';
  end if;

  select o.owner_id, o.metadata ->> 'mimetype' as mime_type into stored
  from storage.objects o
  where o.bucket_id = 'receipts' and o.name = p_storage_path;
  if stored.owner_id is null or stored.owner_id <> uploader::text then
    raise exception 'receipt_not_uploaded' using errcode = '22023';
  end if;

  insert into public.expense_attachments (expense_id, storage_path, content_type, uploaded_by)
  values (p_expense_id, p_storage_path, coalesce(stored.mime_type, 'image/jpeg'), uploader)
  on conflict (storage_path) do nothing
  returning id into new_attachment;
  if new_attachment is null then
    -- Already registered: a retry after the first response was lost. The path
    -- was checked above to belong to this expense, so return the same receipt.
    select id into new_attachment from public.expense_attachments where storage_path = p_storage_path;
    return new_attachment;
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense_apartment, uploader, 'expense', p_expense_id, 'receipt_added',
          jsonb_build_object('attachment_id', new_attachment));

  return new_attachment;
end;
$$;

revoke execute on function private.add_expense_attachment(uuid, text) from public;
grant execute on function private.add_expense_attachment(uuid, text) to authenticated;

create function public.add_expense_attachment(p_expense_id uuid, p_storage_path text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.add_expense_attachment(p_expense_id, p_storage_path) $$;

revoke execute on function public.add_expense_attachment(uuid, text) from public, anon;
grant execute on function public.add_expense_attachment(uuid, text) to authenticated;
