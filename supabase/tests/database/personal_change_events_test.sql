-- Change events for profiles and receiving accounts (decision 0007), written
-- by their owners directly, as a client would.
begin;

select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anas@example.test', '{"display_name": "Anas"}'),
  ('22222222-2222-2222-2222-222222222222', 'zubair@example.test', '{"display_name": "Zubair"}');

create function pg_temp.act_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.a() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create function pg_temp.z() returns uuid language sql as $$ select '22222222-2222-2222-2222-222222222222'::uuid $$;
create temporary table vals (name text primary key, val text);
grant all on table vals to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from vals where name = key $$;
create function pg_temp.sent(p_topic text, p_kind text) returns integer language sql as $$
  select count(*)::int from realtime.messages
  where topic = p_topic and payload ->> 'kind' = p_kind and event = 'change'
$$;

-- Anas and Zubair share Flat 4B; Anas also has a second flat, which he leaves.
select pg_temp.act_as(pg_temp.a());
insert into vals values ('flat', public.create_apartment('Flat 4B', 1)::text);
insert into vals values ('old', public.create_apartment('Old flat', 1)::text);
insert into vals values ('code', public.create_invite(pg_temp.v('flat')::uuid));
insert into vals values ('old-code', public.create_invite(pg_temp.v('old')::uuid));
select pg_temp.act_as(pg_temp.z());
select public.join_apartment(pg_temp.v('code'));
select public.join_apartment(pg_temp.v('old-code'));
select pg_temp.act_as(pg_temp.a());
select public.set_member_role(pg_temp.v('old')::uuid, pg_temp.z(), 'admin');
select public.leave_apartment(pg_temp.v('old')::uuid);

-- Profiles.
select pg_temp.act_as(pg_temp.a());
update public.profiles set display_name = 'Anas Latif' where id = pg_temp.a();
reset role;
select is(pg_temp.sent('user:' || pg_temp.a(), 'profile'), 1, 'renaming tells the user''s other devices');
select is(pg_temp.sent('apartment:' || pg_temp.v('flat'), 'profile'), 1, 'and the apartments they are in');
select is(pg_temp.sent('apartment:' || pg_temp.v('old'), 'profile'), 1,
  'and apartments they left, whose history still shows their name');

select pg_temp.act_as(pg_temp.a());
update public.profiles set display_name = 'Anas Latif' where id = pg_temp.a();
reset role;
select is(pg_temp.sent('user:' || pg_temp.a(), 'profile'), 1, 'saving the same name sends nothing');

-- Receiving accounts.
select pg_temp.act_as(pg_temp.a());
insert into public.receiving_accounts (user_id, kind, provider, account_title, account_identifier)
values (pg_temp.a(), 'bank', 'Meezan Bank', 'Anas Latif', 'PK36MEZN0001234567890')
returning id \gset
insert into vals values ('account', :'id');
reset role;
select is(pg_temp.sent('user:' || pg_temp.a(), 'account'), 1, 'adding an account tells the owner''s other devices');
select is(pg_temp.sent('apartment:' || pg_temp.v('flat'), 'account'), 0, 'but no apartment, while it is not shared');

select pg_temp.act_as(pg_temp.a());
insert into public.receiving_account_shares (account_id, apartment_id)
values (pg_temp.v('account')::uuid, pg_temp.v('flat')::uuid);
reset role;
select is(pg_temp.sent('apartment:' || pg_temp.v('flat'), 'account'), 1, 'sharing it tells the apartment');

select pg_temp.act_as(pg_temp.a());
update public.receiving_accounts set account_title = 'M Anas Latif' where id = pg_temp.v('account')::uuid;
reset role;
select is(pg_temp.sent('apartment:' || pg_temp.v('flat'), 'account'), 2,
  'editing a shared account tells the apartments it is shared with');

select pg_temp.act_as(pg_temp.a());
delete from public.receiving_accounts where id = pg_temp.v('account')::uuid;
reset role;
select is(pg_temp.sent('apartment:' || pg_temp.v('flat'), 'account'), 3,
  'deleting it tells the apartment, through its removed share');
select is(
  (select array_agg(distinct key order by key) from realtime.messages, jsonb_object_keys(payload) key),
  array['id', 'kind'],
  'no account details or names are ever in an event');

select * from finish();

rollback;
