create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text not null check (char_length(btrim(feedback)) between 3 and 2000),
  nickname text not null check (char_length(btrim(nickname)) between 2 and 40),
  photo_urls text[] not null default '{}',
  moderation_status text not null default 'published' check (moderation_status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_reviews_product_published_idx
  on public.product_reviews(product_id, created_at desc)
  where moderation_status = 'published';
create index if not exists product_reviews_user_created_idx
  on public.product_reviews(user_id, created_at desc);
alter table public.product_reviews enable row level security;
drop policy if exists "Published product reviews are public" on public.product_reviews;
create policy "Published product reviews are public" on public.product_reviews
  for select to anon, authenticated
  using (moderation_status = 'published' or user_id = (select auth.uid()) or public.is_genmerch_admin());
drop policy if exists "Customers can update own review" on public.product_reviews;
create policy "Customers can update own review" on public.product_reviews
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke insert, delete on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;
grant update (rating, feedback, nickname, photo_urls, updated_at) on public.product_reviews to authenticated;

create or replace function public.submit_product_review(
  p_order_item_id uuid, p_rating integer, p_feedback text, p_nickname text, p_photo_urls text[] default '{}'
) returns public.product_reviews
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_review public.product_reviews%rowtype;
  v_photos text[] := coalesce(p_photo_urls, '{}');
begin
  if v_user_id is null then raise exception 'Please sign in to submit a product review.' using errcode = '28000'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5 stars.'; end if;
  if p_feedback is null or char_length(btrim(p_feedback)) < 3 or char_length(btrim(p_feedback)) > 2000 then raise exception 'Feedback must be between 3 and 2000 characters.'; end if;
  if p_nickname is null or char_length(btrim(p_nickname)) < 2 or char_length(btrim(p_nickname)) > 40 then raise exception 'Nickname must be between 2 and 40 characters.'; end if;
  if cardinality(v_photos) > 3 then raise exception 'You can attach up to 3 photos.'; end if;
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found.'; end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if not found or v_order.user_id is distinct from v_user_id then raise exception 'This order item does not belong to your account.' using errcode = '42501'; end if;
  if lower(v_order.status) <> 'delivered' then raise exception 'You can review this product after the order is delivered.'; end if;
  if v_item.product_id is null then raise exception 'This order item is no longer linked to a product that can be reviewed.'; end if;
  if exists (select 1 from unnest(v_photos) u(url)
    where url !~ '^https://[^[:space:]]+$' or url not like '%/storage/v1/object/public/genmerch-review-photos/%') then
    raise exception 'One or more review photo URLs are invalid.';
  end if;
  insert into public.product_reviews(order_item_id,order_id,product_id,user_id,rating,feedback,nickname,photo_urls)
  values(v_item.id,v_item.order_id,v_item.product_id,v_user_id,p_rating,btrim(p_feedback),btrim(p_nickname),v_photos)
  on conflict(order_item_id) do nothing returning * into v_review;
  if v_review.id is null then raise exception 'This product has already been reviewed for this order.'; end if;
  return v_review;
end;
$$;
revoke all on function public.submit_product_review(uuid,integer,text,text,text[]) from public, anon;
grant execute on function public.submit_product_review(uuid,integer,text,text,text[]) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('genmerch-review-photos','genmerch-review-photos',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Review photos public read" on storage.objects;
create policy "Review photos public read" on storage.objects for select to anon,authenticated
using(bucket_id='genmerch-review-photos');
drop policy if exists "Customers upload own review photos" on storage.objects;
create policy "Customers upload own review photos" on storage.objects for insert to authenticated
with check(bucket_id='genmerch-review-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp'));
drop policy if exists "Customers delete own review photos" on storage.objects;
create policy "Customers delete own review photos" on storage.objects for delete to authenticated
using(bucket_id='genmerch-review-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
