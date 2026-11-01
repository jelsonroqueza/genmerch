create table if not exists public.store_testimonials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  feedback text not null,
  region text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  constraint store_testimonials_display_name_check
    check (char_length(btrim(display_name)) between 2 and 100),
  constraint store_testimonials_feedback_check
    check (char_length(btrim(feedback)) between 3 and 1200),
  constraint store_testimonials_region_check
    check (region in ('Luzon', 'Visayas', 'Mindanao'))
);

create index if not exists store_testimonials_created_at_idx
  on public.store_testimonials (created_at desc);
create index if not exists store_testimonials_user_created_idx
  on public.store_testimonials (user_id, created_at desc)
  where user_id is not null;

alter table public.store_testimonials enable row level security;

revoke all on public.store_testimonials from anon, authenticated;
grant select, insert on public.store_testimonials to anon, authenticated;

drop policy if exists "Public can read store testimonials" on public.store_testimonials;
create policy "Public can read store testimonials"
  on public.store_testimonials
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Guests can submit store testimonials" on public.store_testimonials;
create policy "Guests can submit store testimonials"
  on public.store_testimonials
  for insert
  to anon
  with check (user_id is null and avatar_path is null);

drop policy if exists "Customers can submit own store testimonials" on public.store_testimonials;
create policy "Customers can submit own store testimonials"
  on public.store_testimonials
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      avatar_path is null
      or split_part(avatar_path, '/', 1) = (select auth.uid())::text
    )
  );

create or replace function public.set_store_testimonial_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  profile_name text;
begin
  new.display_name := btrim(coalesce(new.display_name, ''));

  if new.user_id is null then
    new.avatar_path := null;
  else
    if (select auth.uid()) is distinct from new.user_id then
      raise exception 'A testimonial can only be submitted for the signed-in customer.'
        using errcode = '42501';
    end if;

    select nullif(btrim(p.full_name), '')
      into profile_name
      from public.profiles p
      where p.id = new.user_id;

    if profile_name is not null then
      new.display_name := profile_name;
    end if;

    if new.avatar_path is not null
       and split_part(new.avatar_path, '/', 1) <> new.user_id::text then
      raise exception 'The public avatar path must belong to the signed-in customer.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_store_testimonial_identity_before_insert
  on public.store_testimonials;
create trigger set_store_testimonial_identity_before_insert
  before insert on public.store_testimonials
  for each row execute function public.set_store_testimonial_identity();

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'testimonial-avatars',
  'testimonial-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  name = excluded.name,
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers upload own testimonial avatar copies" on storage.objects;
create policy "Customers upload own testimonial avatar copies"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'testimonial-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_testimonials'
  ) then
    alter publication supabase_realtime add table public.store_testimonials;
  end if;
end;
$$;

comment on table public.store_testimonials is
  'Public GENMERCH Trust & Testimonials submissions. Customer avatars are copied into the public testimonial-avatars bucket only when the customer submits a testimonial.';
