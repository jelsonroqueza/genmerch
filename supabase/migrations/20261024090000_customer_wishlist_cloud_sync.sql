-- GENMERCH customer wishlist cloud sync across devices.
-- Each Supabase Auth user can see and change only their own saved products.
CREATE TABLE IF NOT EXISTS public.customer_wishlist (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wishlist_pkey PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS customer_wishlist_user_created_idx
  ON public.customer_wishlist(user_id, created_at ASC);

ALTER TABLE public.customer_wishlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_wishlist FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.customer_wishlist TO authenticated;

DROP POLICY IF EXISTS customer_wishlist_select_own ON public.customer_wishlist;
CREATE POLICY customer_wishlist_select_own
  ON public.customer_wishlist
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_wishlist_insert_own ON public.customer_wishlist;
CREATE POLICY customer_wishlist_insert_own
  ON public.customer_wishlist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_wishlist_delete_own ON public.customer_wishlist;
CREATE POLICY customer_wishlist_delete_own
  ON public.customer_wishlist
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
