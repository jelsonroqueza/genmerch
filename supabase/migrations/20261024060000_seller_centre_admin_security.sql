-- GENMERCH Seller Centre: admin-only writes and private order access.
-- Existing public catalog reads stay active-only.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS location text;

CREATE OR REPLACE FUNCTION public.is_genmerch_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin', false);
$function$;
REVOKE ALL ON FUNCTION public.is_genmerch_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_genmerch_admin() TO anon, authenticated;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products, public.product_images, public.product_variants FROM anon;

DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert/update products" ON public.products;
DROP POLICY IF EXISTS "Public products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Public orders are insertable by everyone" ON public.orders;
DROP POLICY IF EXISTS "Public orders are updatable" ON public.orders;
DROP POLICY IF EXISTS "Public orders are viewable" ON public.orders;

DROP POLICY IF EXISTS genmerch_admin_all_products ON public.products;
CREATE POLICY genmerch_admin_all_products ON public.products
  FOR ALL TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_admin_all_product_images ON public.product_images;
CREATE POLICY genmerch_admin_all_product_images ON public.product_images
  FOR ALL TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_admin_all_product_variants ON public.product_variants;
CREATE POLICY genmerch_admin_all_product_variants ON public.product_variants
  FOR ALL TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_product_insert ON public.products;
CREATE POLICY genmerch_restrict_product_insert ON public.products
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_product_update ON public.products;
CREATE POLICY genmerch_restrict_product_update ON public.products
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_product_delete ON public.products;
CREATE POLICY genmerch_restrict_product_delete ON public.products
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_product_select ON public.products;
CREATE POLICY genmerch_restrict_product_select ON public.products
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (COALESCE(is_active, false) OR public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_image_insert ON public.product_images;
CREATE POLICY genmerch_restrict_image_insert ON public.product_images
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_image_update ON public.product_images;
CREATE POLICY genmerch_restrict_image_update ON public.product_images
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_image_delete ON public.product_images;
CREATE POLICY genmerch_restrict_image_delete ON public.product_images
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_image_select ON public.product_images;
CREATE POLICY genmerch_restrict_image_select ON public.product_images
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    public.is_genmerch_admin()
    OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.is_active = true)
  );

DROP POLICY IF EXISTS genmerch_restrict_variant_insert ON public.product_variants;
CREATE POLICY genmerch_restrict_variant_insert ON public.product_variants
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_variant_update ON public.product_variants;
CREATE POLICY genmerch_restrict_variant_update ON public.product_variants
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_variant_delete ON public.product_variants;
CREATE POLICY genmerch_restrict_variant_delete ON public.product_variants
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_variant_select ON public.product_variants;
CREATE POLICY genmerch_restrict_variant_select ON public.product_variants
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    public.is_genmerch_admin()
    OR (
      is_active = true
      AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.is_active = true)
    )
  );

REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM authenticated;
GRANT SELECT ON TABLE public.orders TO authenticated;

DROP POLICY IF EXISTS genmerch_admin_read_orders ON public.orders;
CREATE POLICY genmerch_admin_read_orders ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_restrict_order_select ON public.orders;
CREATE POLICY genmerch_restrict_order_select ON public.orders
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.is_genmerch_admin() OR user_id = (SELECT auth.uid()));
