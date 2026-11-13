-- Receipts: upload rules, registration of real uploads, visibility, immutability (AC-12).
begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}'),
  ('44444444-4444-4444-4444-444444444444', 'outsider@example.test', '{"display_name": "Outsider"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.join_apartment(pg_temp.v('code'));
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
insert into vals values ('expense', public.post_expense(
  pg_temp.v('flat')::uuid, 'Groceries', 5000, current_date, 'equal',
  '[{"user_id": "11111111-1111-1111-1111-111111111111"}, {"user_id": "22222222-2222-2222-2222-222222222222"}]'::jsonb,
  '[{"user_id": "11111111-1111-1111-1111-111111111111", "amount_minor": 5000}]'::jsonb)::text);
insert into vals values ('path', pg_temp.v('flat') || '/' || pg_temp.v('expense') || '/receipt.jpg');

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
insert into vals values ('other_flat', public.create_apartment('Elsewhere', 1)::text);

-- Uploading --------------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id, metadata)
            values ('receipts', %L, '22222222-2222-2222-2222-222222222222', '{"mimetype": "image/jpeg"}') $$,
         pg_temp.v('path')),
  'a member uploads a receipt under its apartment and expense'
);

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('receipts', %L, '22222222-2222-2222-2222-222222222222') $$,
         pg_temp.v('other_flat') || '/' || pg_temp.v('expense') || '/x.jpg'),
  '42501', null,
  'a receipt cannot be filed under another apartment'
);

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('receipts', %L, '22222222-2222-2222-2222-222222222222') $$, 'receipt.jpg'),
  '42501', null,
  'a receipt must sit under an apartment and expense folder'
);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');

select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner_id)
            values ('receipts', %L, '44444444-4444-4444-4444-444444444444') $$,
         pg_temp.v('flat') || '/' || pg_temp.v('expense') || '/fake.jpg'),
  '42501', null,
  'someone outside the apartment cannot upload'
);

select is_empty($$ select 1 from storage.objects where bucket_id = 'receipts' $$, 'an outsider sees no receipts');

-- Registering --------------------------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

insert into vals values ('attachment',
  public.add_expense_attachment(pg_temp.v('expense')::uuid, pg_temp.v('path'))::text);

select is(
  public.add_expense_attachment(pg_temp.v('expense')::uuid, pg_temp.v('path'))::text,
  pg_temp.v('attachment'),
  'registering the same upload again returns the same receipt'
);

select throws_ok(
  format('select public.add_expense_attachment(%L, %L)', pg_temp.v('expense'),
         pg_temp.v('flat') || '/' || pg_temp.v('expense') || '/missing.jpg'),
  '22023', 'receipt_not_uploaded',
  'a file that was never uploaded cannot be registered'
);

select throws_ok(
  format('select public.add_expense_attachment(%L, %L)', pg_temp.v('expense'), 'elsewhere/receipt.jpg'),
  '22023', 'invalid_receipt_path',
  'a path outside the expense folder is rejected'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select results_eq(
  $$ select content_type, uploaded_by from public.expense_attachments $$,
  $$ values ('image/jpeg'::text, '22222222-2222-2222-2222-222222222222'::uuid) $$,
  'other members see the receipt with its type and uploader'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'receipts'),
  1,
  'and can see the file itself'
);

reset role;

select throws_ok(
  $$ delete from public.expense_attachments $$,
  'P0001', 'immutable_record',
  'receipts cannot be deleted'
);

select * from finish();

rollback;
