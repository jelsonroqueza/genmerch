-- Restore permissive SELECT policies accidentally removed by the RLS consolidation.
-- Restrictive policies are additional filters; they do not grant SELECT access on their own.
create policy products_read_active
  on public.products
  for select to anon, authenticated
  using (coalesce(is_active, false) or public.is_genmerch_admin());

create policy variants_read_active
  on public.product_variants
  for select to anon, authenticated
  using (
    public.is_genmerch_admin()
    or (
      is_active = true
      and exists (
        select 1
        from public.products p
        where p.id = product_variants.product_id
          and p.is_active = true
      )
    )
  );

create policy product_images_read_active
  on public.product_images
  for select to anon, authenticated
  using (
    public.is_genmerch_admin()
    or exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.is_active = true
    )
  );

create policy orders_select_own
  on public.orders
  for select to authenticated
  using (
    public.is_genmerch_admin()
    or user_id = (select auth.uid())
  );
