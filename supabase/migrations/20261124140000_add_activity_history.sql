-- Activity history (SRS FR-10.8; task 2.9, decision 24).
--
-- The audit trail already records who created, edited, disputed, paid and
-- settled each record. This adds an apartment-wide timeline over it, and
-- makes each entry as private as its record: until now every current member
-- could read every audit row, including those about payments between others
-- (section 12, item 8).

-- Who reads an entry -----------------------------------------------------------------------

-- An entry about a payment, netting or adjustment shows to those who can read
-- that record: its two people and the admins. Join codes, requests to join,
-- invitations back and repeatable expenses are managed by admins only, so
-- only they see their entries. Everything else is the apartment's, as before.
-- The checks read the records under the caller's own access, so they follow
-- those tables' policies.
drop policy "Members can read the activity history" on public.audit_events;

create policy "Members read the history of what they can see"
on public.audit_events
for select
to authenticated
using (
  (select private.is_active_member(apartment_id))
  and case
    when entity_type = 'payment' then exists (select 1 from public.payments p where p.id = entity_id)
    when entity_type = 'offset' then exists (select 1 from public.offsets o where o.id = entity_id)
    when entity_type = 'adjustment' then exists (select 1 from public.adjustments a where a.id = entity_id)
    when entity_type in ('invite', 'join_request', 'rejoin_invite', 'recurring_template', 'recurring_bill')
      then private.is_apartment_admin(apartment_id)
    else true
  end
);

-- The timeline pages newest first by id.
create index audit_events_apartment_id on public.audit_events (apartment_id, id desc);

-- The timeline -----------------------------------------------------------------------------

-- Which entries each filter of the timeline covers.
create function private.activity_group(p_entity_type text, p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entity_type = 'expense' and p_action like 'dispute\_%' then 'disputes'
    when p_entity_type = 'expense' then 'expenses'
    when p_entity_type in ('payment', 'offset', 'adjustment', 'settlement_period') then 'payments'
    when p_entity_type in ('member', 'join_request', 'rejoin_invite', 'invite') then 'members'
    else 'settings'
  end
$$;

revoke execute on function private.activity_group(text, text) from public;
grant execute on function private.activity_group(text, text) to authenticated;

-- One page of the apartment's timeline, newest first, for current members.
-- Entries come through the policy above, so each person sees only what they
-- may. p_group is one of expenses, disputes, payments, members, settings;
-- p_actor_id keeps what one person did; p_before continues after the last id
-- of the previous page. Each entry names what it is about where that is
-- still readable: the record's title, its amount, and the people in it.
create function public.get_activity(
  p_apartment_id uuid,
  p_group text default null,
  p_actor_id uuid default null,
  p_before bigint default null,
  p_limit integer default 30
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  details jsonb,
  subject text,
  amount_minor bigint,
  person_id uuid,
  counterparty_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_active_member(p_apartment_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_group is not null and p_group not in ('expenses', 'disputes', 'payments', 'members', 'settings') then
    raise exception 'invalid_group' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  return query
  select e.id, e.created_at, e.actor_id, e.entity_type, e.entity_id, e.action, e.details,
    case e.entity_type
      when 'expense' then x.title
      when 'expense_template' then t.title
      when 'recurring_template' then rt.title
      when 'recurring_bill' then rbt.title
      when 'category' then c.name
      when 'budget' then bc.name
    end,
    case e.entity_type
      when 'expense' then x.amount_minor
      when 'payment' then p.amount_minor
      when 'offset' then o.amount_minor
      when 'adjustment' then a.amount_minor
    end,
    case e.entity_type
      when 'payment' then p.payer_id
      when 'offset' then o.initiator_id
      when 'adjustment' then a.debtor_id
      when 'member' then e.entity_id
      when 'join_request' then (e.details ->> 'user_id')::uuid
      when 'rejoin_invite' then (e.details ->> 'user_id')::uuid
    end,
    case e.entity_type
      when 'payment' then p.recipient_id
      when 'offset' then o.counterparty_id
      when 'adjustment' then a.creditor_id
    end
  from public.audit_events e
  left join public.expenses x on e.entity_type = 'expense' and x.id = e.entity_id
  left join public.expense_templates t on e.entity_type = 'expense_template' and t.id = e.entity_id
  left join public.recurring_templates rt on e.entity_type = 'recurring_template' and rt.id = e.entity_id
  left join public.recurring_instances ri on e.entity_type = 'recurring_bill' and ri.id = e.entity_id
  left join public.recurring_templates rbt on rbt.id = ri.template_id
  left join public.expense_categories c on e.entity_type = 'category' and c.id = e.entity_id
  left join public.expense_categories bc
    on e.entity_type = 'budget' and bc.id = (e.details ->> 'category_id')::uuid
  left join public.payments p on e.entity_type = 'payment' and p.id = e.entity_id
  left join public.offsets o on e.entity_type = 'offset' and o.id = e.entity_id
  left join public.adjustments a on e.entity_type = 'adjustment' and a.id = e.entity_id
  where e.apartment_id = p_apartment_id
    and (p_before is null or e.id < p_before)
    and (p_actor_id is null or e.actor_id = p_actor_id)
    and (p_group is null or private.activity_group(e.entity_type, e.action) = p_group)
  order by e.id desc
  limit p_limit;
end;
$$;

revoke execute on function public.get_activity(uuid, text, uuid, bigint, integer) from public, anon;
grant execute on function public.get_activity(uuid, text, uuid, bigint, integer) to authenticated;
