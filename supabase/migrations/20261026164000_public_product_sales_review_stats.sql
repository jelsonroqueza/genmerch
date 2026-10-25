create or replace function public.get_public_product_sales_review_stats(p_product_id uuid)
returns table(sold_count bigint, review_count bigint, average_rating numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((
      select sum(oi.quantity)::bigint
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = p_product_id
        and lower(o.status) = 'delivered'
    ), 0)::bigint as sold_count,
    coalesce((
      select count(*)::bigint
      from public.product_reviews r
      where r.product_id = p_product_id
        and r.moderation_status = 'published'
    ), 0)::bigint as review_count,
    coalesce((
      select round(avg(r.rating)::numeric, 1)
      from public.product_reviews r
      where r.product_id = p_product_id
        and r.moderation_status = 'published'
    ), 0)::numeric as average_rating;
$$;

revoke all on function public.get_public_product_sales_review_stats(uuid) from public;
grant execute on function public.get_public_product_sales_review_stats(uuid) to anon, authenticated;
