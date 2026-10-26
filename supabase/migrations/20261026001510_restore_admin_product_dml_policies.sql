-- Restore permissive admin DML policies for Seller Centre product creation and editing.
-- Restrictive policies alone do not grant DML access; at least one applicable
-- permissive policy is required, and these policies still enforce admin-only writes.
CREATE POLICY genmerch_admin_insert_products
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_update_products
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_delete_products
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_insert_product_images
  ON public.product_images
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_update_product_images
  ON public.product_images
  FOR UPDATE
  TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_delete_product_images
  ON public.product_images
  FOR DELETE
  TO authenticated
  USING (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_insert_product_variants
  ON public.product_variants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_update_product_variants
  ON public.product_variants
  FOR UPDATE
  TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

CREATE POLICY genmerch_admin_delete_product_variants
  ON public.product_variants
  FOR DELETE
  TO authenticated
  USING (public.is_genmerch_admin());
