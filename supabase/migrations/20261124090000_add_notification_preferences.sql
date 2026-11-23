-- Notification preferences (SRS FR-01.2, FR-09.2; task 2.5).
--
-- Each person can turn off push notifications by group, for every apartment
-- at once. Only the push is held back: the notification is still created, so
-- the red dots in the app still lead to what changed. A group is on unless a
-- row here turns it off, so nobody has to opt in after this migration.

create table public.notification_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint notification_mutes_category_valid check (
    category in ('expenses', 'payments', 'disputes', 'members', 'reminders', 'settlement')
  )
);

comment on table public.notification_mutes is
  'Push groups a person turned off. Notifications are still created; only the push is skipped.';

alter table public.notification_mutes enable row level security;
revoke all on table public.notification_mutes from anon, authenticated;
grant select on table public.notification_mutes to authenticated;

create policy "People read their own push preferences"
on public.notification_mutes
for select
to authenticated
using (user_id = (select auth.uid()));

-- The group a notification type belongs to. Every type the database creates
-- falls in one, so each can be turned off.
create function private.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'expense.dispute\_%' then 'disputes'
    when p_type like 'expense.%' or p_type like 'recurring\_bill.%' then 'expenses'
    when p_type like 'payment.%' or p_type like 'offset.%' or p_type like 'adjustment.%' then 'payments'
    when p_type like 'member.%' or p_type like 'join\_request.%' or p_type like 'rejoin\_invite.%' then 'members'
    when p_type like 'reminder.%' then 'reminders'
    when p_type like 'settlement\_period.%' then 'settlement'
  end
$$;

revoke execute on function private.notification_category(text) from public;

-- Turns one group's push on or off for the caller, and tells their other
-- devices. Setting what is already set changes nothing.
create function private.set_notification_push(p_category text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.require_user();
  changed integer;
begin
  if p_category is null
     or p_category not in ('expenses', 'payments', 'disputes', 'members', 'reminders', 'settlement') then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'invalid_enabled' using errcode = '22023';
  end if;

  if p_enabled then
    delete from public.notification_mutes where user_id = me and category = p_category;
  else
    insert into public.notification_mutes (user_id, category) values (me, p_category)
    on conflict do nothing;
  end if;
  get diagnostics changed = row_count;

  if changed > 0 then
    perform private.emit_change('user:' || me, 'notification_preference');
  end if;
end;
$$;

revoke execute on function private.set_notification_push(text, boolean) from public;
grant execute on function private.set_notification_push(text, boolean) to authenticated;

create function public.set_notification_push(p_category text, p_enabled boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_notification_push(p_category, p_enabled) $$;

revoke execute on function public.set_notification_push(text, boolean) from public, anon;
grant execute on function public.set_notification_push(text, boolean) to authenticated;

-- As in 20261114104853_add_notifications.sql, with one more reason to skip a
-- push: its group is turned off ('muted'). It is checked when the push is
-- sent, so turning a group off also holds back pushes still waiting.
create or replace function private.claim_pushes(p_limit integer)
returns table (notification_id uuid, token text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed uuid[];
begin
  with due as (
    select n.id
    from public.notifications n
    where (
        (n.push_status in ('pending', 'failed') and n.push_attempts < private.max_push_attempts())
        or (n.push_status = 'sending' and n.push_claimed_at < now() - interval '5 minutes')
      )
      and n.push_next_attempt_at <= now()
    order by n.created_at
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
    for update skip locked
  ),
  skipped as (
    update public.notifications n
    set push_status = 'skipped',
        push_error = case
          when n.created_at < now() - interval '1 day' then 'expired'
          when exists (
            select 1 from public.notification_mutes m
            where m.user_id = n.user_id and m.category = private.notification_category(n.type)
          ) then 'muted'
          else 'no_device'
        end
    from due
    where n.id = due.id
      and (n.created_at < now() - interval '1 day'
           or exists (
             select 1 from public.notification_mutes m
             where m.user_id = n.user_id and m.category = private.notification_category(n.type)
           )
           or not exists (select 1 from public.push_tokens t where t.user_id = n.user_id))
    returning n.id
  ),
  taken as (
    update public.notifications n
    set push_status = 'sending', push_attempts = n.push_attempts + 1, push_claimed_at = now()
    from due
    where n.id = due.id and n.id not in (select id from skipped)
    returning n.id
  )
  select coalesce(array_agg(id), '{}') into claimed from taken;

  return query
  select n.id, t.token, private.push_text(n.type)
  from public.notifications n
  join public.push_tokens t on t.user_id = n.user_id
  where n.id = any (claimed)
  order by n.created_at;
end;
$$;
