-- Rent, utilities and internet are repeatable expenses (SRS FR-04), which
-- admins set up in the apartment's settings, so they are no longer one-time
-- expense categories. New apartments start without them, and existing
-- apartments archive them. Archiving never deletes: expenses already filed
-- under them keep their category, and an admin can add one back.

create or replace function private.add_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (apartment_id, name)
  select new.id, category
  from unnest(array['Groceries', 'Household', 'Cleaning', 'Maintenance', 'Other']) as category;
  return new;
end;
$$;

-- One statement for the categories and one for their history, so each
-- apartment gets one change event. The system archived them, so no actor.
with archived as (
  update public.expense_categories
  set archived_at = now()
  where archived_at is null and lower(name) in ('rent', 'utilities', 'internet')
  returning id, apartment_id
)
insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
select apartment_id, null, 'category', id, 'archived', jsonb_build_object('reason', 'repeatable_expense')
from archived;
