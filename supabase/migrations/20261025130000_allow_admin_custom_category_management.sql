-- Allow only authorized GENMERCH admins to create and manage categories.
-- Public/regular customer access remains read-only for active categories.

BEGIN;

GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.categories TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.categories FROM anon;

DROP POLICY IF EXISTS genmerch_admin_all_categories ON public.categories;
CREATE POLICY genmerch_admin_all_categories
  ON public.categories
  FOR ALL
  TO authenticated
  USING (public.is_genmerch_admin())
  WITH CHECK (public.is_genmerch_admin());

COMMIT;
