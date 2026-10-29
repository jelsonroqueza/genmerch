begin;

alter table public.customer_addresses
  add column if not exists address_label text not null default 'Saved address';

create unique index if not exists customer_addresses_one_default_per_user_idx
  on public.customer_addresses (user_id)
  where is_default = true;

create table if not exists public.customer_default_landmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Default landmark',
  landmark text not null,
  delivery_instructions text not null default 'N/A',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_default_landmarks_label_length check (char_length(btrim(label)) between 1 and 80),
  constraint customer_default_landmarks_value_length check (char_length(btrim(landmark)) between 1 and 250),
  constraint customer_default_landmarks_instructions_length check (char_length(btrim(delivery_instructions)) between 1 and 500)
);

create index if not exists customer_default_landmarks_user_created_idx
  on public.customer_default_landmarks (user_id, created_at desc);

create unique index if not exists customer_default_landmarks_one_default_per_user_idx
  on public.customer_default_landmarks (user_id)
  where is_default = true;

alter table public.customer_default_landmarks enable row level security;

drop policy if exists customer_default_landmarks_select_own on public.customer_default_landmarks;
create policy customer_default_landmarks_select_own
  on public.customer_default_landmarks for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists customer_default_landmarks_insert_own on public.customer_default_landmarks;
create policy customer_default_landmarks_insert_own
  on public.customer_default_landmarks for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists customer_default_landmarks_update_own on public.customer_default_landmarks;
create policy customer_default_landmarks_update_own
  on public.customer_default_landmarks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists customer_default_landmarks_delete_own on public.customer_default_landmarks;
create policy customer_default_landmarks_delete_own
  on public.customer_default_landmarks for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.customer_default_landmarks to authenticated;
revoke all on public.customer_default_landmarks from anon, public;

drop trigger if exists customer_default_landmarks_set_updated_at on public.customer_default_landmarks;
create trigger customer_default_landmarks_set_updated_at
before update on public.customer_default_landmarks
for each row execute function public.set_updated_at();

commit;