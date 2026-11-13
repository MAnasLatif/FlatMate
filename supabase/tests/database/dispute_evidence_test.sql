-- Evidence on a dispute (SRS FR-05.7).
begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('33333333-3333-3333-3333-333333333333', 'ajmal@example.test', '{"display_name": "Ajmal"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create function pg_temp.j() returns uuid language sql as $$ select '33333333-3333-3333-3333-333333333333'::uuid $$;
create function pg_temp.o() returns uuid language sql as $$ select '44444444-4444-4444-4444-444444444444'::uuid $$;

create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.upload(path text, owner uuid) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('dispute-evidence', path, owner::text, '{"mimetype": "image/png"}')
$$;

-- Zubair pays for groceries shared with Anas and Ajmal; Ajmal disputes it.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as(pg_temp.z());
select public.join_apartment(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.j());
select public.join_apartment(pg_temp.v('code'));
select pg_temp.act_as(pg_temp.z());
insert into vals values ('groceries', public.post_expense(
  pg_temp.v('flat')::uuid, 'Groceries', 30000, current_date, 'equal',
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.a()), jsonb_build_object('user_id', pg_temp.z()),
                    jsonb_build_object('user_id', pg_temp.j())),
  jsonb_build_array(jsonb_build_object('user_id', pg_temp.z(), 'amount_minor', 30000)))::text);
select pg_temp.act_as(pg_temp.j());
insert into vals values ('dispute', public.raise_dispute(pg_temp.v('groceries')::uuid, 'decline', 'I was travelling')::text);
insert into vals values ('ajmal_path', pg_temp.v('flat') || '/' || pg_temp.v('dispute') || '/ticket.png');
insert into vals values ('zubair_path', pg_temp.v('flat') || '/' || pg_temp.v('dispute') || '/receipt.png');

-- Adding ----------------------------------------------------------------------------------

select lives_ok($$ select pg_temp.upload(pg_temp.v('ajmal_path'), pg_temp.j()) $$, 'the person who raised it uploads a photo');
select lives_ok(
  $$ insert into vals values ('evidence', public.add_dispute_evidence(pg_temp.v('dispute')::uuid, pg_temp.v('ajmal_path'))::text) $$,
  'and adds it to the dispute'
);
select is(
  public.add_dispute_evidence(pg_temp.v('dispute')::uuid, pg_temp.v('ajmal_path'))::text,
  pg_temp.v('evidence'),
  'adding the same file again returns the same evidence'
);
select throws_ok($$ select public.add_dispute_evidence(pg_temp.v('dispute')::uuid, pg_temp.v('zubair_path')) $$,
  '22023', 'evidence_not_uploaded', 'a file that was never uploaded cannot be added');

select pg_temp.act_as(pg_temp.z());
select lives_ok($$ select pg_temp.upload(pg_temp.v('zubair_path'), pg_temp.z()) $$, 'the person who added the expense can answer with a photo');
select lives_ok($$ select public.add_dispute_evidence(pg_temp.v('dispute')::uuid, pg_temp.v('zubair_path')) $$,
  'and add it');
select is(
  (select uploaded_by from public.dispute_attachments where storage_path = pg_temp.v('ajmal_path')),
  pg_temp.j(),
  'evidence keeps who uploaded it'
);

-- Who may not -----------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.o());
select throws_ok($$ select pg_temp.upload(pg_temp.v('flat') || '/' || pg_temp.v('dispute') || '/fake.png', pg_temp.o()) $$,
  '42501', null, 'someone outside the apartment cannot upload');
select is_empty($$ select 1 from public.dispute_attachments $$, 'or see any evidence');

select pg_temp.act_as(pg_temp.j());
select public.withdraw_dispute(pg_temp.v('dispute')::uuid);
select throws_ok($$ select pg_temp.upload(pg_temp.v('flat') || '/' || pg_temp.v('dispute') || '/late.png', pg_temp.j()) $$,
  '42501', null, 'nothing can be added once the dispute is resolved');

reset role;
select throws_ok($$ delete from public.dispute_attachments $$, 'P0001', 'immutable_record', 'evidence cannot be deleted');

select * from finish();

rollback;
