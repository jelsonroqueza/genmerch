-- Consolidate overlapping SELECT policies without changing intended access:
-- active catalog rows remain public; administrators retain full catalog management;
-- customers continue to read only their own order-related records.
drop policy if exists products_read_active on public.products;
drop policy if exists genmerch_admin_all_products on public.products;

drop policy if exists variants_read_active on public.product_variants;
drop policy if exists genmerch_admin_all_product_variants on public.product_variants;

drop policy if exists product_images_read_active on public.product_images;
drop policy if exists genmerch_admin_all_product_images on public.product_images;

drop policy if exists genmerch_admin_all_categories on public.categories;
drop policy if exists genmerch_admin_insert_categories on public.categories;
drop policy if exists genmerch_admin_update_categories on public.categories;
drop policy if exists genmerch_admin_delete_categories on public.categories;

create policy genmerch_admin_insert_categories on public.categories
  for insert to authenticated with check (public.is_genmerch_admin());
create policy genmerch_admin_update_categories on public.categories
  for update to authenticated using (public.is_genmerch_admin())
  with check (public.is_genmerch_admin());
create policy genmerch_admin_delete_categories on public.categories
  for delete to authenticated using (public.is_genmerch_admin());

drop policy if exists categories_read_active on public.categories;
create policy categories_read_active on public.categories
  for select to anon, authenticated
  using (is_active = true or public.is_genmerch_admin());

drop policy if exists genmerch_admin_read_orders on public.orders;
drop policy if exists orders_select_own on public.orders;
-- genmerch_restrict_order_select already permits the owner or a verified admin.

drop policy if exists genmerch_admin_read_order_items on public.order_items;
drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    public.is_genmerch_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = (select auth.uid())
    )
  );

drop policy if exists genmerch_admin_read_order_status_history on public.order_status_history;
drop policy if exists genmerch_customer_read_own_order_status_history on public.order_status_history;
create policy genmerch_customer_read_own_order_status_history on public.order_status_history
  for select to authenticated
  using (
    public.is_genmerch_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id and o.user_id = (select auth.uid())
    )
  );

drop policy if exists genmerch_admin_read_shipments on public.shipments;
drop policy if exists shipments_select_own on public.shipments;
create policy shipments_select_own on public.shipments
  for select to authenticated
  using (
    public.is_genmerch_admin()
    or exists (
      select 1 from public.orders o
      where o.id = shipments.order_id and o.user_id = (select auth.uid())
    )
  );

-- These tables contain private notification/application state and are intended for
-- trusted Edge Functions using the service_role, never direct customer/browser access.
drop policy if exists cancellation_email_notifications_service_role_only on public.cancellation_email_notifications;
create policy cancellation_email_notifications_service_role_only
  on public.cancellation_email_notifications for all to service_role
  using (true) with check (true);

drop policy if exists genmerch_partner_applications_service_role_only on public.genmerch_partner_applications;
create policy genmerch_partner_applications_service_role_only
  on public.genmerch_partner_applications for all to service_role
  using (true) with check (true);

drop policy if exists genmerch_welcome_email_notifications_service_role_only on public.genmerch_welcome_email_notifications;
create policy genmerch_welcome_email_notifications_service_role_only
  on public.genmerch_welcome_email_notifications for all to service_role
  using (true) with check (true);

drop policy if exists order_email_notifications_service_role_only on public.order_email_notifications;
create policy order_email_notifications_service_role_only
  on public.order_email_notifications for all to service_role
  using (true) with check (true);

drop policy if exists shipment_email_notifications_service_role_only on public.shipment_email_notifications;
create policy shipment_email_notifications_service_role_only
  on public.shipment_email_notifications for all to service_role
  using (true) with check (true);
