-- Evidence on a dispute (SRS FR-05.7, decision record 0004).
--
-- Photos the people in a dispute add to support it: the person who raised
-- it, the person who added the expense, and the apartment's admins. They live
-- in a private bucket under <apartment id>/<dispute id>/, can be added while
-- the dispute is unresolved, and are never replaced or deleted. Anyone who can
-- see the expense can see them, through signed links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);

create table public.dispute_attachments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  storage_path text not null unique,
  content_type text not null,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint dispute_attachments_type_valid check (content_type in ('image/jpeg', 'image/png', 'image/webp'))
);

create index dispute_attachments_dispute on public.dispute_attachments (dispute_id);
create index dispute_attachments_uploaded_by on public.dispute_attachments (uploaded_by);

create trigger dispute_attachments_immutable before update or delete on public.dispute_attachments
for each row execute function private.reject_change();

alter table public.dispute_attachments enable row level security;
revoke all on table public.dispute_attachments from anon, authenticated;
grant select on table public.dispute_attachments to authenticated;

create policy "Readers of an expense can read its dispute evidence"
on public.dispute_attachments
for select
to authenticated
using (exists (
  select 1 from public.disputes d
  where d.id = dispute_id and (select private.can_view_expense(d.expense_id))
));

-- The folders of an evidence path, checked to be ids before they are used.
create function private.evidence_path_ids(path text)
returns table (apartment_id uuid, dispute_id uuid)
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

-- Whether the caller takes part in a dispute that is still unresolved: they
-- raised it, added the expense, or are an admin, and are a current member.
create function private.can_add_evidence(p_dispute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.disputes d
    join public.expenses e on e.id = d.expense_id
    join public.apartment_members m
      on m.apartment_id = d.apartment_id and m.user_id = (select auth.uid()) and m.left_at is null
    where d.id = p_dispute_id
      and d.state <> 'resolved'
      and (m.user_id in (d.raised_by, e.created_by) or m.role = 'admin')
  );
$$;

create function private.can_upload_evidence(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.evidence_path_ids(path) ids
    join public.disputes d on d.id = ids.dispute_id and d.apartment_id = ids.apartment_id
    where private.can_add_evidence(d.id)
  );
$$;

create function private.can_view_evidence(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.evidence_path_ids(path) ids
    join public.disputes d on d.id = ids.dispute_id and d.apartment_id = ids.apartment_id
    where private.can_view_expense(d.expense_id)
  );
$$;

revoke execute on function private.evidence_path_ids(text) from public;
revoke execute on function private.can_add_evidence(uuid) from public;
revoke execute on function private.can_upload_evidence(text) from public;
revoke execute on function private.can_view_evidence(text) from public;
grant execute on function private.can_upload_evidence(text) to authenticated;
grant execute on function private.can_view_evidence(text) to authenticated;

-- Insert only: with no update or delete policy, files cannot be replaced or removed.
create policy "Parties to a dispute can upload evidence"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'dispute-evidence' and (select private.can_upload_evidence(name)));

create policy "Readers of an expense can read its dispute evidence"
on storage.objects
for select
to authenticated
using (bucket_id = 'dispute-evidence' and (select private.can_view_evidence(name)));

-- Registers an uploaded file as evidence on its dispute. The file must exist
-- and have been uploaded by the caller. Registering the same file twice
-- returns the same attachment, so a retried request is safe.
create function private.add_dispute_evidence(p_dispute_id uuid, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uploader uuid := private.require_user();
  dispute public.disputes;
  stored record;
  attachment uuid;
begin
  select * into dispute from public.disputes where id = p_dispute_id;
  if dispute.id is null or not private.can_view_expense(dispute.expense_id) then
    raise exception 'dispute_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from private.evidence_path_ids(p_storage_path) ids
    where ids.apartment_id = dispute.apartment_id and ids.dispute_id = dispute.id
  ) then
    raise exception 'invalid_evidence_path' using errcode = '22023';
  end if;

  select id into attachment from public.dispute_attachments where storage_path = p_storage_path;
  if attachment is not null then
    return attachment;
  end if;
  if not private.can_add_evidence(dispute.id) then
    raise exception 'not_allowed_to_add_evidence' using errcode = '42501';
  end if;

  select o.owner_id, o.metadata ->> 'mimetype' as mime_type into stored
  from storage.objects o
  where o.bucket_id = 'dispute-evidence' and o.name = p_storage_path;
  if stored.owner_id is null or stored.owner_id <> uploader::text then
    raise exception 'evidence_not_uploaded' using errcode = '22023';
  end if;

  insert into public.dispute_attachments (dispute_id, storage_path, content_type, uploaded_by)
  values (dispute.id, p_storage_path, coalesce(stored.mime_type, 'image/jpeg'), uploader)
  returning id into attachment;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (dispute.apartment_id, uploader, 'expense', dispute.expense_id, 'dispute_evidence_added',
          jsonb_build_object('dispute_id', dispute.id, 'attachment_id', attachment));

  return attachment;
end;
$$;

revoke execute on function private.add_dispute_evidence(uuid, text) from public;
grant execute on function private.add_dispute_evidence(uuid, text) to authenticated;

create function public.add_dispute_evidence(p_dispute_id uuid, p_storage_path text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.add_dispute_evidence(p_dispute_id, p_storage_path) $$;

revoke execute on function public.add_dispute_evidence(uuid, text) from public, anon;
grant execute on function public.add_dispute_evidence(uuid, text) to authenticated;
