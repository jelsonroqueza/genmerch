-- Customer-owned private profile photos.
-- Each authenticated customer can access only the object files in their own UUID folder.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'customer-avatars',
  'customer-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer_avatars_select_own" on storage.objects;
create policy "customer_avatars_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists "customer_avatars_insert_own" on storage.objects;
create policy "customer_avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists "customer_avatars_delete_own" on storage.objects;
create policy "customer_avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

comment on column public.profiles.avatar_path is
  'Private Supabase Storage object path for the customer profile photo.';
