-- Disputes about expenses (SRS FR-05.2 to FR-05.7, AC-06, section 12 items 2
-- and 4, decision record 0004).
--
-- Someone in an expense's split can decline it or propose a different share
-- for themselves. Inside the objection window the dispute holds every share of
-- the expense (the expense becomes 'disputed') and pauses the window; after
-- the expense is final it opens an adjustment case that holds nothing, so
-- final and closed figures never move. The expense's creator accepts, which
-- writes a new revision with the adjusted split, or rejects, after which an
-- admin who is neither of the two decides. The person who raised it can
-- withdraw it. Every step is kept in dispute_events, which never change.

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  -- Payment disputes are added by the payments migration.
  subject_type text not null default 'expense',
  expense_id uuid references public.expenses (id) on delete restrict,
  -- The revision that was objected to.
  expense_revision integer,
  kind text not null,
  raised_by uuid not null references public.profiles (id) on delete restrict,
  reason text not null,
  -- The share the raiser proposes for themselves. A decline proposes zero.
  proposed_share_minor bigint not null,
  -- Raised after the objection window closed: an adjustment case that holds nothing.
  is_late boolean not null,
  -- What was left of the objection window when the dispute paused it.
  window_remaining interval,
  state text not null default 'open',
  resolution text,
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  constraint disputes_subject_valid check (subject_type in ('expense')),
  constraint disputes_expense_subject check (
    (subject_type = 'expense') = (expense_id is not null and expense_revision is not null)
  ),
  constraint disputes_kind_valid check (kind in ('decline', 'adjustment')),
  constraint disputes_reason_valid check (char_length(reason) between 1 and 1000 and reason = btrim(reason)),
  constraint disputes_proposal_valid check (proposed_share_minor >= 0),
  constraint disputes_decline_is_zero check (kind <> 'decline' or proposed_share_minor = 0),
  constraint disputes_window_valid check (is_late = (window_remaining is null)),
  constraint disputes_state_valid check (state in ('open', 'escalated', 'resolved')),
  constraint disputes_resolution_valid check (
    (state = 'resolved') = (resolution is not null and resolved_at is not null)
  ),
  constraint disputes_resolution_kind check (resolution is null or resolution in ('adjusted', 'upheld', 'withdrawn')),
  constraint disputes_request_unique unique (apartment_id, client_request_id)
);

-- One dispute at a time per expense, so each resolution starts from the split
-- everyone saw.
create unique index disputes_one_open_per_expense on public.disputes (expense_id) where state <> 'resolved';
create index disputes_apartment_state on public.disputes (apartment_id, state);
create index disputes_raised_by on public.disputes (raised_by);

create table public.dispute_events (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dispute_events_action_valid check (
    action in ('raised', 'accepted', 'rejected', 'withdrawn', 'upheld', 'adjusted')
  ),
  constraint dispute_events_message_valid check (message is null or char_length(message) between 1 and 1000)
);

create index dispute_events_dispute on public.dispute_events (dispute_id, id);
create index dispute_events_actor on public.dispute_events (actor_id);
create index disputes_resolved_by on public.disputes (resolved_by) where resolved_by is not null;

create trigger dispute_events_immutable before update or delete on public.dispute_events
for each row execute function private.reject_change();

alter table public.disputes enable row level security;
alter table public.dispute_events enable row level security;
revoke all on table public.disputes, public.dispute_events from anon, authenticated;
grant select on table public.disputes, public.dispute_events to authenticated;

-- Anyone who can see the expense sees its disputes and their history.
create policy disputes_select on public.disputes
for select to authenticated
using ((select private.can_view_expense(expense_id)));

create policy dispute_events_select on public.dispute_events
for select to authenticated
using (exists (
  select 1 from public.disputes d
  where d.id = dispute_id and (select private.can_view_expense(d.expense_id))
));

-- Helpers ---------------------------------------------------------------------------------

-- Refuses a change to an expense while a dispute about it is open.
create function private.require_no_open_dispute(p_expense_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.disputes where expense_id = p_expense_id and state <> 'resolved') then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
end;
$$;

-- Largest-remainder apportionment over any weights, by the same rule as
-- compute_shares: floors first, leftover units to the largest remainders,
-- ties to the lowest user id. p_weights: [{"user_id", "weight"}], weights
-- positive and summing to more than zero.
create function private.apportion(p_total bigint, p_weights jsonb)
returns table (user_id uuid, amount_minor bigint)
language sql
immutable
set search_path = ''
as $$
  with weighted as (
    select (w ->> 'user_id')::uuid as participant, (w ->> 'weight')::bigint as weight
    from jsonb_array_elements(p_weights) w
  ),
  ordered as (
    select participant, weight,
      row_number() over (order by participant) as position,
      (sum(weight) over ())::bigint as total_weight
    from weighted
  ),
  -- Weights here are amounts, so the product can exceed bigint: it is
  -- computed in exact numeric and only the results come back as bigint.
  parts as (
    select participant, position,
      div(p_total::numeric * weight, total_weight)::bigint as base,
      mod(p_total::numeric * weight, total_weight) as remainder
    from ordered
  ),
  leftover as (select (p_total - sum(base))::bigint as units from parts),
  ranked as (select parts.*, row_number() over (order by remainder desc, position) as rank from parts)
  select ranked.participant, (ranked.base + case when ranked.rank <= leftover.units then 1 else 0 end)::bigint
  from ranked cross join leftover
  order by ranked.position;
$$;

-- The split after giving one participant a new share: the difference is
-- spread over the other participants in proportion to their current shares.
-- Returns [{"user_id", "amount_minor"}] for every current participant.
create function private.adjusted_split(p_expense public.expenses, p_user_id uuid, p_share bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  others_total bigint;
  result jsonb;
begin
  select coalesce(sum(s.amount_minor), 0)::bigint into others_total
  from public.expense_splits s
  where s.expense_id = p_expense.id and s.revision = p_expense.revision and s.user_id <> p_user_id;
  if others_total = 0 then
    raise exception 'adjustment_not_possible' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('user_id', share.user_id, 'amount_minor', share.amount_minor) order by share.user_id)
  into result
  from (
    select p_user_id as user_id, p_share as amount_minor
    union all
    select a.user_id, a.amount_minor
    from private.apportion(
      p_expense.amount_minor - p_share,
      (select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'weight', s.amount_minor))
       from public.expense_splits s
       where s.expense_id = p_expense.id and s.revision = p_expense.revision
         and s.user_id <> p_user_id and s.amount_minor > 0)
    ) a
    union all
    -- Participants with a zero share keep it.
    select s.user_id, 0::bigint
    from public.expense_splits s
    where s.expense_id = p_expense.id and s.revision = p_expense.revision
      and s.user_id <> p_user_id and s.amount_minor = 0
  ) share;
  return result;
end;
$$;

-- Applies a dispute's proposal as a new revision with a fixed split. The
-- payers stay the same. Charges still in force are reversed and the new ones
-- posted; the expense becomes provisional with a new objection window, since
-- the other participants' shares changed. Returns the new revision.
create function private.apply_dispute_adjustment(p_dispute public.disputes, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense public.expenses;
  new_split jsonb;
  next_revision integer;
  approval_days integer;
begin
  select * into expense from public.expenses where id = p_dispute.expense_id for update;
  -- Edits are refused while a dispute is open, so the revision cannot have moved.
  if expense.revision <> p_dispute.expense_revision then
    raise exception 'expense_changed' using errcode = 'P0001';
  end if;

  new_split := private.adjusted_split(expense, p_dispute.raised_by, p_dispute.proposed_share_minor);
  next_revision := expense.revision + 1;
  select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
  values (expense.id, next_revision, expense.amount_minor, 'fixed', p_actor, 'dispute adjusted');

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor)
  select expense.id, next_revision, (s ->> 'user_id')::uuid, (s ->> 'amount_minor')::bigint
  from jsonb_array_elements(new_split) s;

  insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
  select expense.id, next_revision, p.user_id, p.amount_minor
  from public.expense_payers p
  where p.expense_id = expense.id and p.revision = expense.revision;

  perform private.reverse_open_charges(expense.id);
  if expense.paid_status = 'paid' then
    perform private.post_charges(expense.id, next_revision);
  end if;

  update public.expenses
  set revision = next_revision,
      status = 'provisional',
      finalize_after = now() + make_interval(days => approval_days),
      finalized_at = null
  where id = expense.id;

  return next_revision;
end;
$$;

-- Ends a dispute's hold without changing the expense: a dispute raised inside
-- the window resumes it with the time that was left.
create function private.release_dispute_hold(p_dispute public.disputes)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not p_dispute.is_late then
    update public.expenses
    set status = 'provisional',
        finalize_after = now() + p_dispute.window_remaining
    where id = p_dispute.expense_id and status = 'disputed';
  end if;
end;
$$;

revoke execute on function private.require_no_open_dispute(uuid) from public;
revoke execute on function private.apportion(bigint, jsonb) from public;
revoke execute on function private.adjusted_split(public.expenses, uuid, bigint) from public;
revoke execute on function private.apply_dispute_adjustment(public.disputes, uuid) from public;
revoke execute on function private.release_dispute_hold(public.disputes) from public;

-- Raising ---------------------------------------------------------------------------------

-- p_kind: 'decline' (the raiser should not share this expense) or
-- 'adjustment' (their share should be p_proposed_share_minor). The reason is
-- required. A retried request with the same p_client_request_id returns the
-- dispute the first one created.
create function private.raise_dispute(
  p_expense_id uuid,
  p_kind text,
  p_reason text,
  p_proposed_share_minor bigint,
  p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  raiser uuid := private.require_user();
  expense public.expenses;
  existing uuid;
  current_share bigint;
  proposal bigint;
  reason text := btrim(p_reason);
  late boolean;
  new_dispute uuid;
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  if p_client_request_id is not null then
    select id into existing from public.disputes
    where apartment_id = expense.apartment_id and client_request_id = p_client_request_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if expense.status = 'void' then
    raise exception 'expense_void' using errcode = 'P0001';
  end if;
  if expense.created_by = raiser then
    raise exception 'cannot_dispute_own_expense' using errcode = 'P0001';
  end if;
  select s.amount_minor into current_share
  from public.expense_splits s
  where s.expense_id = expense.id and s.revision = expense.revision and s.user_id = raiser;
  if current_share is null then
    raise exception 'not_in_expense' using errcode = '42501';
  end if;
  if expense.status = 'disputed'
     or exists (select 1 from public.disputes where expense_id = expense.id and state <> 'resolved') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end if;

  if p_kind is null or p_kind not in ('decline', 'adjustment') then
    raise exception 'invalid_dispute_kind' using errcode = '22023';
  end if;
  if reason is null or reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if char_length(reason) > 1000 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;
  proposal := case when p_kind = 'decline' then 0 else p_proposed_share_minor end;
  if proposal is null or proposal < 0 or proposal > expense.amount_minor then
    raise exception 'invalid_proposed_share' using errcode = '22023';
  end if;
  if proposal = current_share then
    raise exception 'proposal_matches_share' using errcode = '22023';
  end if;
  -- Checks that somebody else can take on the difference.
  perform private.adjusted_split(expense, raiser, proposal);

  late := expense.status = 'final' or now() >= expense.finalize_after;

  insert into public.disputes (
    apartment_id, expense_id, expense_revision, kind, raised_by, reason, proposed_share_minor,
    is_late, window_remaining, client_request_id
  )
  values (
    expense.apartment_id, expense.id, expense.revision, p_kind, raiser, reason, proposal,
    late, case when late then null else expense.finalize_after - now() end, p_client_request_id
  )
  returning id into new_dispute;

  if not late then
    update public.expenses set status = 'disputed' where id = expense.id;
  end if;

  insert into public.dispute_events (dispute_id, actor_id, action, message, details)
  values (new_dispute, raiser, 'raised', reason, jsonb_build_object(
    'kind', p_kind, 'current_share_minor', current_share, 'proposed_share_minor', proposal, 'late', late
  ));
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense.apartment_id, raiser, 'expense', expense.id, 'dispute_raised',
          jsonb_build_object('dispute_id', new_dispute, 'kind', p_kind, 'late', late));

  return new_dispute;
end;
$$;

-- Responding, withdrawing and deciding -------------------------------------------------------

-- The expense's creator accepts the proposal, which adjusts the split, or
-- rejects it with a message, which leaves the decision to an admin. Giving
-- the same answer again changes nothing.
create function private.respond_to_dispute(p_dispute_id uuid, p_accept boolean, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  responder uuid := private.require_user();
  dispute public.disputes;
  expense public.expenses;
  message text := nullif(btrim(p_message), '');
  new_revision integer;
begin
  select * into dispute from public.disputes where id = p_dispute_id for update;
  select * into expense from public.expenses where id = dispute.expense_id;
  if dispute.id is null or not private.is_active_member(dispute.apartment_id) then
    raise exception 'dispute_not_found' using errcode = 'P0002';
  end if;
  if expense.created_by <> responder then
    raise exception 'not_expense_creator' using errcode = '42501';
  end if;
  if p_accept and dispute.state = 'resolved' and dispute.resolution = 'adjusted' and dispute.resolved_by = responder then
    return;
  end if;
  if not p_accept and dispute.state = 'escalated' and exists (
    select 1 from public.dispute_events where dispute_id = dispute.id and action = 'rejected' and actor_id = responder
  ) then
    return;
  end if;
  if dispute.state <> 'open' then
    raise exception 'dispute_not_open' using errcode = 'P0001';
  end if;
  if message is not null and char_length(message) > 1000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  if p_accept then
    new_revision := private.apply_dispute_adjustment(dispute, responder);
    update public.disputes
    set state = 'resolved', resolution = 'adjusted', resolved_by = responder, resolved_at = now()
    where id = dispute.id;
    insert into public.dispute_events (dispute_id, actor_id, action, message, details)
    values (dispute.id, responder, 'accepted', message, jsonb_build_object('revision', new_revision));
  else
    if message is null then
      raise exception 'message_required' using errcode = '22023';
    end if;
    update public.disputes set state = 'escalated' where id = dispute.id;
    insert into public.dispute_events (dispute_id, actor_id, action, message)
    values (dispute.id, responder, 'rejected', message);
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (dispute.apartment_id, responder, 'expense', dispute.expense_id,
          case when p_accept then 'dispute_accepted' else 'dispute_rejected' end,
          jsonb_build_object('dispute_id', dispute.id));
end;
$$;

-- The person who raised a dispute takes it back. The expense stays as it was.
create function private.withdraw_dispute(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.require_user();
  dispute public.disputes;
begin
  select * into dispute from public.disputes where id = p_dispute_id for update;
  if dispute.id is null or not private.is_active_member(dispute.apartment_id) then
    raise exception 'dispute_not_found' using errcode = 'P0002';
  end if;
  if dispute.raised_by <> actor then
    raise exception 'not_dispute_raiser' using errcode = '42501';
  end if;
  if dispute.state = 'resolved' and dispute.resolution = 'withdrawn' then
    return;
  end if;
  if dispute.state = 'resolved' then
    raise exception 'dispute_not_open' using errcode = 'P0001';
  end if;

  perform 1 from public.expenses where id = dispute.expense_id for update;
  perform private.release_dispute_hold(dispute);
  update public.disputes
  set state = 'resolved', resolution = 'withdrawn', resolved_by = actor, resolved_at = now()
  where id = dispute.id;

  insert into public.dispute_events (dispute_id, actor_id, action) values (dispute.id, actor, 'withdrawn');
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (dispute.apartment_id, actor, 'expense', dispute.expense_id, 'dispute_withdrawn',
          jsonb_build_object('dispute_id', dispute.id));
end;
$$;

-- An admin who is neither the person who raised the dispute nor the expense's
-- creator decides a dispute the creator rejected, or one the creator can no
-- longer answer because they left. p_apply adjusts the split as proposed;
-- otherwise the expense is upheld as it is. A message is required.
create function private.decide_dispute(p_dispute_id uuid, p_apply boolean, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := private.require_user();
  dispute public.disputes;
  expense public.expenses;
  message text := nullif(btrim(p_message), '');
  new_revision integer;
  outcome text := case when p_apply then 'adjusted' else 'upheld' end;
begin
  select * into dispute from public.disputes where id = p_dispute_id for update;
  select * into expense from public.expenses where id = dispute.expense_id;
  if dispute.id is null or not private.is_active_member(dispute.apartment_id) then
    raise exception 'dispute_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.apartment_members
    where apartment_id = dispute.apartment_id and user_id = admin and left_at is null and role = 'admin'
  ) or admin in (dispute.raised_by, expense.created_by) then
    raise exception 'not_allowed_to_decide' using errcode = '42501';
  end if;
  if dispute.state = 'resolved' and dispute.resolution = outcome and dispute.resolved_by = admin then
    return;
  end if;
  if not (
    dispute.state = 'escalated'
    or (dispute.state = 'open' and not exists (
      select 1 from public.apartment_members
      where apartment_id = dispute.apartment_id and user_id = expense.created_by and left_at is null
    ))
  ) then
    raise exception 'dispute_not_escalated' using errcode = 'P0001';
  end if;
  if message is null then
    raise exception 'message_required' using errcode = '22023';
  end if;
  if char_length(message) > 1000 then
    raise exception 'message_too_long' using errcode = '22023';
  end if;

  if p_apply then
    new_revision := private.apply_dispute_adjustment(dispute, admin);
  else
    perform 1 from public.expenses where id = dispute.expense_id for update;
    perform private.release_dispute_hold(dispute);
  end if;
  update public.disputes
  set state = 'resolved', resolution = outcome, resolved_by = admin, resolved_at = now()
  where id = dispute.id;

  insert into public.dispute_events (dispute_id, actor_id, action, message, details)
  values (dispute.id, admin, outcome, message,
          case when p_apply then jsonb_build_object('revision', new_revision) else '{}'::jsonb end);
  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (dispute.apartment_id, admin, 'expense', dispute.expense_id, 'dispute_decided',
          jsonb_build_object('dispute_id', dispute.id, 'outcome', outcome));
end;
$$;

revoke execute on function private.raise_dispute(uuid, text, text, bigint, uuid) from public;
revoke execute on function private.respond_to_dispute(uuid, boolean, text) from public;
revoke execute on function private.withdraw_dispute(uuid) from public;
revoke execute on function private.decide_dispute(uuid, boolean, text) from public;
grant execute on function private.raise_dispute(uuid, text, text, bigint, uuid) to authenticated;
grant execute on function private.respond_to_dispute(uuid, boolean, text) to authenticated;
grant execute on function private.withdraw_dispute(uuid) to authenticated;
grant execute on function private.decide_dispute(uuid, boolean, text) to authenticated;

create function public.raise_dispute(
  p_expense_id uuid,
  p_kind text,
  p_reason text,
  p_proposed_share_minor bigint default null,
  p_client_request_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.raise_dispute(p_expense_id, p_kind, p_reason, p_proposed_share_minor, p_client_request_id) $$;

create function public.respond_to_dispute(p_dispute_id uuid, p_accept boolean, p_message text default null)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.respond_to_dispute(p_dispute_id, p_accept, p_message) $$;

create function public.withdraw_dispute(p_dispute_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.withdraw_dispute(p_dispute_id) $$;

create function public.decide_dispute(p_dispute_id uuid, p_apply boolean, p_message text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.decide_dispute(p_dispute_id, p_apply, p_message) $$;

revoke execute on function public.raise_dispute(uuid, text, text, bigint, uuid) from public, anon;
revoke execute on function public.respond_to_dispute(uuid, boolean, text) from public, anon;
revoke execute on function public.withdraw_dispute(uuid) from public, anon;
revoke execute on function public.decide_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.raise_dispute(uuid, text, text, bigint, uuid) to authenticated;
grant execute on function public.respond_to_dispute(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_dispute(uuid) to authenticated;
grant execute on function public.decide_dispute(uuid, boolean, text) to authenticated;

-- Changes to an expense wait for its dispute ------------------------------------------------
-- An adjustment case after the deadline leaves the expense final, so the
-- functions that change an expense also check for an open dispute. They are
-- otherwise unchanged.

create or replace function private.edit_expense(
  p_expense_id uuid,
  p_expected_revision integer,
  p_title text,
  p_category_id uuid,
  p_description text,
  p_expense_date date,
  p_due_date date,
  p_amount_minor bigint,
  p_split_method text,
  p_participants jsonb,
  p_payers jsonb,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := private.require_user();
  expense public.expenses;
  approval_days integer;
  current_method text;
  new_splits jsonb;
  current_splits jsonb;
  new_payers jsonb;
  current_payers jsonb;
  changes jsonb := '{}'::jsonb;
  money_changed boolean;
  next_revision integer;
  new_title text := btrim(p_title);
  new_description text := nullif(btrim(p_description), '');
  reason text := nullif(btrim(p_reason), '');
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  perform private.require_can_edit_expense(expense);
  if expense.status = 'void' then
    raise exception 'expense_void' using errcode = 'P0001';
  end if;
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
  perform private.require_no_open_dispute(expense.id);

  -- Descriptive fields.
  if p_category_id is distinct from expense.category_id and p_category_id is not null and not exists (
    select 1 from public.expense_categories
    where id = p_category_id and apartment_id = expense.apartment_id and archived_at is null
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < p_expense_date then
    raise exception 'due_date_before_expense_date' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  select changes
    || case when new_title is distinct from expense.title
         then jsonb_build_object('title', jsonb_build_object('from', expense.title, 'to', new_title)) else '{}' end
    || case when p_category_id is distinct from expense.category_id
         then jsonb_build_object('category_id', jsonb_build_object('from', expense.category_id, 'to', p_category_id)) else '{}' end
    || case when new_description is distinct from expense.description
         then jsonb_build_object('description', jsonb_build_object('from', expense.description, 'to', new_description)) else '{}' end
    || case when p_expense_date is distinct from expense.expense_date
         then jsonb_build_object('expense_date', jsonb_build_object('from', expense.expense_date, 'to', p_expense_date)) else '{}' end
    || case when p_due_date is distinct from expense.due_date
         then jsonb_build_object('due_date', jsonb_build_object('from', expense.due_date, 'to', p_due_date)) else '{}' end
  into changes;

  -- The money, compared with the current revision. compute_shares validates the split.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', share.user_id,
           'amount_minor', share.amount_minor,
           'basis_points', case when p_split_method = 'percentage' then (
             select (p ->> 'basis_points')::integer from jsonb_array_elements(p_participants) p
             where (p ->> 'user_id')::uuid = share.user_id
           ) end
         ) order by share.user_id), '[]'::jsonb)
  into new_splits
  from private.compute_shares(p_amount_minor, p_split_method, p_participants) share;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'amount_minor', s.amount_minor, 'basis_points', s.basis_points
         ) order by s.user_id), '[]'::jsonb)
  into current_splits
  from public.expense_splits s
  where s.expense_id = expense.id and s.revision = expense.revision;

  if expense.paid_status = 'paid' then
    perform private.require_valid_payers(coalesce(p_payers, '[]'::jsonb), p_amount_minor);
  elsif coalesce(jsonb_array_length(p_payers), 0) > 0 then
    raise exception 'unpaid_bill_has_no_payers' using errcode = '22023';
  end if;
  perform private.require_edit_parties(expense, p_participants, 'participant_not_member');
  perform private.require_edit_parties(expense, coalesce(p_payers, '[]'::jsonb), 'payer_not_member');

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', (payer ->> 'user_id')::uuid, 'amount_minor', (payer ->> 'amount_minor')::bigint
         ) order by (payer ->> 'user_id')::uuid), '[]'::jsonb)
  into new_payers
  from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) payer;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'amount_minor', p.amount_minor)
           order by p.user_id), '[]'::jsonb)
  into current_payers
  from public.expense_payers p
  where p.expense_id = expense.id and p.revision = expense.revision;

  select r.split_method into current_method
  from public.expense_revisions r
  where r.expense_id = expense.id and r.revision = expense.revision;

  money_changed := p_amount_minor <> expense.amount_minor
    or p_split_method <> current_method
    or new_splits <> current_splits
    or new_payers <> current_payers;

  if not money_changed and changes = '{}'::jsonb then
    return expense.revision;
  end if;
  if money_changed and p_expected_revision is distinct from expense.revision then
    raise exception 'expense_changed' using errcode = 'P0001';
  end if;

  update public.expenses
  set title = new_title,
      category_id = p_category_id,
      description = new_description,
      expense_date = p_expense_date,
      due_date = p_due_date
  where id = expense.id;

  next_revision := expense.revision;
  if money_changed then
    next_revision := expense.revision + 1;
    select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

    insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
    values (expense.id, next_revision, p_amount_minor, p_split_method, editor, reason);

    insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
    select expense.id, next_revision, (s ->> 'user_id')::uuid, (s ->> 'amount_minor')::bigint,
           (s ->> 'basis_points')::integer
    from jsonb_array_elements(new_splits) s;

    insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
    select expense.id, next_revision, (p ->> 'user_id')::uuid, (p ->> 'amount_minor')::bigint
    from jsonb_array_elements(new_payers) p;

    perform private.reverse_open_charges(expense.id);
    if expense.paid_status = 'paid' then
      perform private.post_charges(expense.id, next_revision);
    end if;

    update public.expenses
    set amount_minor = p_amount_minor,
        revision = next_revision,
        status = 'provisional',
        finalize_after = now() + make_interval(days => approval_days),
        finalized_at = null
    where id = expense.id;

    changes := changes
      || jsonb_build_object('revision', jsonb_build_object('from', expense.revision, 'to', next_revision))
      || case when p_amount_minor <> expense.amount_minor
           then jsonb_build_object('amount_minor', jsonb_build_object('from', expense.amount_minor, 'to', p_amount_minor))
           else '{}' end;
  end if;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    expense.apartment_id, editor, 'expense', expense.id, 'edited',
    jsonb_build_object('changes', changes, 'reason', reason)
  );

  return next_revision;
end;
$$;

create or replace function private.void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := private.require_user();
  expense public.expenses;
  reason text := nullif(btrim(p_reason), '');
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  perform private.require_can_edit_expense(expense);
  if expense.status = 'void' then
    return;
  end if;
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
  perform private.require_no_open_dispute(expense.id);
  if reason is not null and char_length(reason) > 500 then
    raise exception 'reason_too_long' using errcode = '22023';
  end if;

  perform private.reverse_open_charges(expense.id);
  update public.expenses set status = 'void' where id = expense.id;

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (expense.apartment_id, editor, 'expense', expense.id, 'voided', jsonb_build_object('reason', reason));
end;
$$;

create or replace function private.record_bill_payment(p_expense_id uuid, p_payers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorder uuid := private.require_user();
  expense public.expenses;
  approval_days integer;
  next_revision integer;
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if expense.id is null or not private.is_active_member(expense.apartment_id) then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if expense.paid_status <> 'unpaid' or expense.status = 'void' then
    raise exception 'expense_not_unpaid' using errcode = 'P0001';
  end if;
  -- Paying would reset the status, which must not clear an open dispute.
  if expense.status = 'disputed' then
    raise exception 'expense_disputed' using errcode = 'P0001';
  end if;
  perform private.require_no_open_dispute(expense.id);

  perform private.require_valid_payers(p_payers, expense.amount_minor);
  perform private.require_current_members(expense.apartment_id, p_payers, 'payer_not_member');

  next_revision := expense.revision + 1;

  insert into public.expense_revisions (expense_id, revision, amount_minor, split_method, created_by, reason)
  select p_expense_id, next_revision, r.amount_minor, r.split_method, recorder, 'bill paid'
  from public.expense_revisions r
  where r.expense_id = p_expense_id and r.revision = expense.revision;

  insert into public.expense_splits (expense_id, revision, user_id, amount_minor, basis_points)
  select p_expense_id, next_revision, s.user_id, s.amount_minor, s.basis_points
  from public.expense_splits s
  where s.expense_id = p_expense_id and s.revision = expense.revision;

  insert into public.expense_payers (expense_id, revision, user_id, amount_minor)
  select p_expense_id, next_revision, (payer ->> 'user_id')::uuid, (payer ->> 'amount_minor')::bigint
  from jsonb_array_elements(p_payers) payer;

  select a.approval_days into approval_days from public.apartments a where a.id = expense.apartment_id;

  update public.expenses
  set paid_status = 'paid',
      revision = next_revision,
      status = 'provisional',
      finalize_after = now() + make_interval(days => approval_days)
  where id = p_expense_id;

  perform private.post_charges(p_expense_id, next_revision);

  insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action, details)
  values (
    expense.apartment_id, recorder, 'expense', p_expense_id, 'bill_paid',
    jsonb_build_object('payers', p_payers, 'revision', next_revision)
  );
end;
$$;
