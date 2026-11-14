-- Change events for personal data (decision 0007).
--
-- Profiles and receiving accounts are written by their owners directly, under
-- RLS, so they write no audit_events row. These triggers send their change
-- events instead: to the owner's own topic, for their other devices, and to
-- every apartment that shows the change. Like every change event, they carry
-- only the kind of change.

-- A new name or photo shows wherever the person appears, including the history
-- of apartments they have left.
create function private.emit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.emit_change('user:' || new.id, 'profile');
  perform private.emit_change('apartment:' || membership.apartment_id, 'profile')
  from (select distinct apartment_id from public.apartment_members where user_id = new.id) membership;
  return null;
end;
$$;

revoke execute on function private.emit_profile_change() from public;

create trigger profiles_emit_change
after update of display_name, avatar_path on public.profiles
for each row
when (old.display_name is distinct from new.display_name or old.avatar_path is distinct from new.avatar_path)
execute function private.emit_profile_change();

-- An account's owner sees it on every device. Flatmates see it in the
-- apartments it is shared with; sharing and unsharing are covered by the
-- trigger on the shares, which also runs when deleting an account removes them.
create function private.emit_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.receiving_accounts := coalesce(new, old);
begin
  perform private.emit_change('user:' || account.user_id, 'account');
  if tg_op = 'UPDATE' then
    perform private.emit_change('apartment:' || share.apartment_id, 'account')
    from public.receiving_account_shares share
    where share.account_id = account.id;
  end if;
  return null;
end;
$$;

revoke execute on function private.emit_account_change() from public;

create trigger receiving_accounts_emit_change
after insert or update or delete on public.receiving_accounts
for each row execute function private.emit_account_change();

create function private.emit_account_share_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  share public.receiving_account_shares := coalesce(new, old);
  owner uuid;
begin
  perform private.emit_change('apartment:' || share.apartment_id, 'account');
  -- Gone when the account itself is being deleted; its own trigger tells the owner.
  select user_id into owner from public.receiving_accounts where id = share.account_id;
  if owner is not null then
    perform private.emit_change('user:' || owner, 'account');
  end if;
  return null;
end;
$$;

revoke execute on function private.emit_account_share_change() from public;

create trigger receiving_account_shares_emit_change
after insert or delete on public.receiving_account_shares
for each row execute function private.emit_account_share_change();
