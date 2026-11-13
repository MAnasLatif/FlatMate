-- Split arithmetic (decision record 0003, SRS FR-03.4, FR-06.6).
--
-- The authority for how an expense is shared and who owes whom. The app's
-- preview (app/src/features/expenses/split.ts) follows the same rules, and
-- both are tested against the same cases. Amounts are bigint minor units.

-- Each participant's share of the total, ordered by user id.
--
-- p_participants is a JSON array of objects with "user_id", plus
-- "basis_points" (percentage splits, summing to 10000) or "amount_minor"
-- (fixed splits, summing to the total). Equal and percentage splits use the
-- largest-remainder method, leftover units going to the largest remainders
-- and ties to the lowest user id.
create function private.compute_shares(p_total bigint, p_method text, p_participants jsonb)
returns table (user_id uuid, amount_minor bigint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  participant_count integer;
  distinct_count integer;
  value_sum numeric;
begin
  if p_total is null or p_total <= 0 or p_total > 1000000000000 then
    raise exception 'invalid_total' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('equal', 'percentage', 'fixed') then
    raise exception 'invalid_split_method' using errcode = '22023';
  end if;
  if p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'no_participants' using errcode = '22023';
  end if;

  select count(*), count(distinct (p ->> 'user_id')::uuid)
  into participant_count, distinct_count
  from jsonb_array_elements(p_participants) p;
  if participant_count <> distinct_count then
    raise exception 'duplicate_participant' using errcode = '22023';
  end if;

  if p_method in ('percentage', 'fixed') then
    if exists (
      select 1
      from jsonb_array_elements(p_participants) p
      cross join lateral (
        select p -> (case p_method when 'percentage' then 'basis_points' else 'amount_minor' end) as v
      ) value
      where value.v is null
         or jsonb_typeof(value.v) <> 'number'
         or (value.v)::numeric < 0
         or (value.v)::numeric <> trunc((value.v)::numeric)
    ) then
      raise exception 'invalid_share' using errcode = '22023';
    end if;

    select sum((p -> (case p_method when 'percentage' then 'basis_points' else 'amount_minor' end))::numeric)
    into value_sum
    from jsonb_array_elements(p_participants) p;

    if p_method = 'percentage' and value_sum <> 10000 then
      raise exception 'percentages_must_total_100' using errcode = '22023';
    end if;
    if p_method = 'fixed' and value_sum <> p_total then
      raise exception 'fixed_amounts_must_match_total' using errcode = '22023';
    end if;
  end if;

  if p_method = 'fixed' then
    return query
    select (p ->> 'user_id')::uuid, (p ->> 'amount_minor')::bigint
    from jsonb_array_elements(p_participants) p
    order by 1;
    return;
  end if;

  return query
  with weighted as (
    select
      (p ->> 'user_id')::uuid as participant,
      case p_method when 'equal' then 1::bigint else (p ->> 'basis_points')::bigint end as weight
    from jsonb_array_elements(p_participants) p
  ),
  ordered as (
    select
      participant,
      weight,
      row_number() over (order by participant) as position,
      -- sum() of bigint is numeric in Postgres; keep the arithmetic integer.
      (sum(weight) over ())::bigint as total_weight
    from weighted
  ),
  parts as (
    select
      participant,
      position,
      div(p_total * weight, total_weight)::bigint as base,
      mod(p_total * weight, total_weight)::bigint as remainder
    from ordered
  ),
  leftover as (
    select (p_total - sum(base))::bigint as units from parts
  ),
  ranked as (
    select parts.*, row_number() over (order by remainder desc, position) as rank
    from parts
  )
  select
    ranked.participant,
    (ranked.base + case when ranked.rank <= leftover.units then 1 else 0 end)::bigint
  from ranked cross join leftover
  order by ranked.position;
end;
$$;

-- Who owes whom for one expense. Each person's contribution first covers
-- their own share; people who paid more than their share are owed by people
-- who paid less, both taken in user id order. Exact in integers.
--
-- Both arguments are JSON arrays of {"user_id", "amount_minor"}.
create function private.match_debts(p_contributions jsonb, p_shares jsonb)
returns table (debtor_id uuid, creditor_id uuid, amount_minor bigint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  creditor_ids uuid[];
  creditor_remaining bigint[];
  creditor_index integer := 1;
  debtor record;
  debtor_remaining bigint;
  taken bigint;
begin
  if (select coalesce(sum((c ->> 'amount_minor')::bigint), 0) from jsonb_array_elements(p_contributions) c)
     <> (select coalesce(sum((s ->> 'amount_minor')::bigint), 0) from jsonb_array_elements(p_shares) s) then
    raise exception 'contributions_must_match_total' using errcode = '22023';
  end if;

  with differences as (
    select person, sum(amount) as difference
    from (
      select (c ->> 'user_id')::uuid as person, (c ->> 'amount_minor')::bigint as amount
      from jsonb_array_elements(p_contributions) c
      union all
      select (s ->> 'user_id')::uuid, -(s ->> 'amount_minor')::bigint
      from jsonb_array_elements(p_shares) s
    ) movements
    group by person
  )
  select array_agg(person order by person), array_agg(difference order by person)
  into creditor_ids, creditor_remaining
  from differences
  where difference > 0;

  for debtor in
    with differences as (
      select person, sum(amount) as difference
      from (
        select (c ->> 'user_id')::uuid as person, (c ->> 'amount_minor')::bigint as amount
        from jsonb_array_elements(p_contributions) c
        union all
        select (s ->> 'user_id')::uuid, -(s ->> 'amount_minor')::bigint
        from jsonb_array_elements(p_shares) s
      ) movements
      group by person
    )
    select person, -difference as owes
    from differences
    where difference < 0
    order by person
  loop
    debtor_remaining := debtor.owes;
    while debtor_remaining > 0 loop
      taken := least(debtor_remaining, creditor_remaining[creditor_index]);
      debtor_id := debtor.person;
      creditor_id := creditor_ids[creditor_index];
      amount_minor := taken;
      return next;
      debtor_remaining := debtor_remaining - taken;
      creditor_remaining[creditor_index] := creditor_remaining[creditor_index] - taken;
      if creditor_remaining[creditor_index] = 0 then
        creditor_index := creditor_index + 1;
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function private.compute_shares(bigint, text, jsonb) from public;
revoke execute on function private.match_debts(jsonb, jsonb) from public;
