-- Proof of a payment (SRS FR-07.3).
begin;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.upload(path text, owner uuid) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('payment-proofs', path, owner::text, '{"mimetype": "image/jpeg"}')
$$;

select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select public.join_apartment(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.a());
select public.post_expense(pg_temp.v('flat')::uuid, 'Internet', 40000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a(), 'amount_minor', 40000)));
select pg_temp.act_as(pg_temp.z());
insert into vals values ('payment', public.record_payment(pg_temp.v('flat')::uuid, pg_temp.a(), 20000)::text);
insert into vals values ('path', pg_temp.v('flat') || '/' || pg_temp.v('payment') || '/screenshot.jpg');

select lives_ok($$ select pg_temp.upload(pg_temp.v('path'), pg_temp.z()) $$, 'the payer uploads a screenshot');
select lives_ok(
  $$ insert into vals values ('proof', public.add_payment_proof(pg_temp.v('payment')::uuid, pg_temp.v('path'))::text) $$,
  'and attaches it to the payment'
);
select is(public.add_payment_proof(pg_temp.v('payment')::uuid, pg_temp.v('path'))::text, pg_temp.v('proof'),
  'attaching it again returns the same proof');

select pg_temp.act_as(pg_temp.a());
select throws_ok($$ select pg_temp.upload(pg_temp.v('flat') || '/' || pg_temp.v('payment') || '/mine.jpg', pg_temp.a()) $$,
  '42501', null, 'the recipient cannot add proof of someone else''s payment');
select is((select count(*)::int from public.payment_attachments), 1, 'but can see the proof');

select pg_temp.act_as(pg_temp.j());
select is_empty($$ select 1 from public.payment_attachments $$, 'a member who is not part of the payment cannot');

reset role;
select throws_ok($$ delete from public.payment_attachments $$, 'P0001', 'immutable_record', 'proof cannot be deleted');

select * from finish();

rollback;
