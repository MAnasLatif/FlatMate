-- Change events (decision 0007): what is sent, to which topic, and who may receive it.
begin;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'sara@example.test', '{"display_name": "Sara"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;

-- Joining needs an admin's approval: ask with the code, then approve as an
-- admin of the apartment, and carry on as the person who joined.
create function pg_temp.join(code text) returns void language plpgsql as $$
declare
  joiner_claims text := current_setting('request.jwt.claims', true);
  result jsonb := public.join_apartment(code);
  admin uuid;
begin
  if result ->> 'status' not in ('requested', 'pending') then
    raise exception 'join failed: %', result;
  end if;
  perform set_config('role', 'postgres', true);
  select user_id into admin from public.apartment_members
  where apartment_id = (result ->> 'apartment_id')::uuid and role = 'admin' and left_at is null
  order by joined_at
  limit 1;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.approve_join_request((result ->> 'request_id')::uuid);
  perform set_config('request.jwt.claims', joiner_claims, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.s() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
-- Messages sent in this test, read as the database owner.
create function pg_temp.sent(p_topic text, p_kind text) returns integer language sql as $$
  select count(*)::int from realtime.messages
  where topic = p_topic and payload ->> 'kind' = p_kind and event = 'change'
$$;
create function pg_temp.flat_topic() returns text language sql as $$ select 'apartment:' || pg_temp.v('flat') $$;

-- Anas creates a flat; Zubair and Ajmal join; Sara never does.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select pg_temp.join(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select pg_temp.join(pg_temp.v('code'));

reset role;
select is(pg_temp.sent('user:' || pg_temp.a(), 'membership'), 1,
  'creating an apartment tells the creator''s other devices');
select is(pg_temp.sent('user:' || pg_temp.z(), 'membership'), 2,
  'asking to join, and being approved, each tell the member''s other devices once');
select is(pg_temp.sent(pg_temp.flat_topic(), 'member'), 2,
  'each join tells the apartment''s members');

-- One statement that writes several audit rows sends one event per apartment and kind.
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat')::uuid, 'Internet', 30000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
    jsonb_build_object('user_id', pg_temp.j())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 30000)));

reset role;
select is(pg_temp.sent(pg_temp.flat_topic(), 'expense'), 1, 'posting an expense sends one expense event');
select is(
  (select count(*)::int from realtime.messages where not private),
  0, 'every event is private');
select is(
  (select array_agg(distinct key order by key) from realtime.messages, jsonb_object_keys(payload) key),
  array['id', 'kind'],
  'events carry only the kind of change and the message id: no amounts, names or record ids');

reset role;
insert into public.audit_events (apartment_id, actor_id, entity_type, entity_id, action)
select pg_temp.v('flat')::uuid, pg_temp.a(), 'expense', gen_random_uuid(), 'finalized'
from generate_series(1, 5);
select is(pg_temp.sent(pg_temp.flat_topic(), 'expense'), 2,
  'five expenses finalized in one statement send one more event, not five');

-- Payment proof is now in the history, and so sends an event.
select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.v('flat')::uuid, pg_temp.a(), 10000)::text);
insert into vals values ('path', pg_temp.v('flat') || '/' || pg_temp.v('payment') || '/screenshot.jpg');
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('payment-proofs', pg_temp.v('path'), pg_temp.z()::text, '{"mimetype": "image/jpeg"}');
select pg_temp.act_as(pg_temp.z());
select public.add_payment_proof(pg_temp.v('payment')::uuid, pg_temp.v('path'));
reset role;
select is(
  (select count(*)::int from public.audit_events where entity_id = pg_temp.v('payment')::uuid and action = 'proof_added'),
  1, 'adding payment proof is recorded in the history');
select is(pg_temp.sent(pg_temp.flat_topic(), 'payment'), 2,
  'recording the payment and adding its proof each send a payment event');

-- Removing a member reaches them on their own topic, which they can still read.
select pg_temp.act_as(pg_temp.a());
select public.remove_member(pg_temp.v('flat')::uuid, pg_temp.j());
reset role;
select is(pg_temp.sent('user:' || pg_temp.j(), 'membership'), 3,
  'a removed member hears about it on their own topic, after the request and approval');

-- A failed send never undoes the write.
select lives_ok($$ select private.emit_change(null, 'expense') $$,
  'a send that cannot work only raises a warning');

-- Who may receive which topic.
select pg_temp.act_as(pg_temp.z());
select ok(private.can_receive_topic(pg_temp.flat_topic()), 'an active member receives the apartment topic');
select ok(private.can_receive_topic('user:' || pg_temp.z()), 'a user receives their own topic');
select ok(not private.can_receive_topic('user:' || pg_temp.a()), 'but not someone else''s');
select ok(not private.can_receive_topic('apartment:' || pg_temp.v('flat') || '-x'), 'a malformed topic is refused');

select pg_temp.act_as(pg_temp.j());
select ok(not private.can_receive_topic(pg_temp.flat_topic()), 'a removed member no longer receives the apartment topic');

-- End to end: the policy Realtime checks, with the topic set as Realtime sets it.
select pg_temp.act_as(pg_temp.s());
select set_config('realtime.topic', pg_temp.flat_topic(), true);
select is_empty($$ select 1 from realtime.messages where topic = pg_temp.flat_topic() $$,
  'an outsider reads nothing on the apartment topic');

select pg_temp.act_as(pg_temp.z());
select set_config('realtime.topic', pg_temp.flat_topic(), true);
select isnt_empty($$ select 1 from realtime.messages where topic = pg_temp.flat_topic() $$,
  'a member reads the apartment topic');

select * from finish();

rollback;
