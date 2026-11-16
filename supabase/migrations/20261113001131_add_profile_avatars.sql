-- Profile photos (SRS FR-01.2).
--
-- Photos live in a private storage bucket, one folder per user named after the
-- user's id. A user can only write to their own folder, and the profile can
-- only point at a file inside it. Flatmates gain read access when apartment
-- membership exists (task 1.6).

alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_own_folder check (
    avatar_path is null or starts_with(avatar_path, id::text || '/')
  );

grant update (avatar_path) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Replacing a photo uploads with upsert, which needs insert, select and update.
create policy "Users can read their own avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can replace their own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
