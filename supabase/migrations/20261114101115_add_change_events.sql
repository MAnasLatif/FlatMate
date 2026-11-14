-- Change events (decision 0007).
--
-- Every change another member, or the same user on another device, can see
-- sends a Realtime Broadcast message, so open apps refresh without polling.
-- A message names only the kind of record that changed: never an id, an
-- amount or a name. The app then refetches through the usual RLS checks.
--
-- Topics:
--   apartment:<apartment id>  readable by the apartment's active members
--   user:<user id>            readable by that user only

-- Sending -------------------------------------------------------------------------------

-- Sends one change event. A failure must never undo the write it describes:
-- realtime.send already turns its own failures into a warning, and this block
-- covers anything that escapes it, such as the function being unavailable.
-- The apps catch up when they reconnect or return to the foreground.
create function private.emit_change(p_topic text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind), 'change', p_topic, true);
exception
  when others then
    raise warning 'change event not sent (%): %', p_kind, sqlstate;
end;
$$;

revoke execute on function private.emit_change(text, text) from public;

-- Apartment changes already write an audit_events row in the same transaction,
-- including those made by scheduled jobs. One event goes out per apartment and
-- kind per statement, so a job that finalizes many expenses sends one event,
-- not one per expense. A membership change, and creating an apartment, also
-- go to the person's own topic: their apartment list changes, and a removed
-- member can no longer read the apartment topic.
create function private.emit_audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.emit_change('apartment:' || changed.apartment_id, changed.entity_type)
  from (select distinct apartment_id, entity_type from added) changed;

  perform private.emit_change('user:' || person.user_id, 'membership')
  from (
    select entity_id as user_id from added where entity_type = 'member' and entity_id is not null
    union
    select actor_id from added where entity_type = 'apartment' and action = 'created' and actor_id is not null
  ) person;

  return null;
end;
$$;

revoke execute on function private.emit_audit_changes() from public;

create trigger audit_events_emit_changes
after insert on public.audit_events
referencing new table as added
for each statement execute function private.emit_audit_changes();

-- Receiving -----------------------------------------------------------------------------

-- Whether the signed-in user may receive a topic. Anything that is not exactly
-- one of the two topic forms is refused.
create function private.can_receive_topic(p_topic text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_topic ~ '^apartment:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_active_member(substr(p_topic, 11)::uuid)
    when p_topic ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 6)::uuid = (select auth.uid())
    else false
  end;
$$;

revoke execute on function private.can_receive_topic(text) from public;
grant execute on function private.can_receive_topic(text) to authenticated;

-- Realtime checks this policy when a client joins a private channel. There is
-- no insert policy, so clients cannot send on these topics; only the database
-- does.
create policy "Members and owners receive change events"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select private.can_receive_topic((select realtime.topic())))
);

-- Payment proof -------------------------------------------------------------------------

-- Adding proof of a payment now records it in the history, like a receipt,
-- which also sends its change event. Otherwise unchanged.
create or replace function private.add_payment_proof(p_payment_id uuid, p_storage_path text)
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

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (payment.apartment_id, uploader, 'payment', payment.id, 'proof_added',
          jsonb_build_object('attachment_id', attachment));

  return attachment;
end;
$$;
