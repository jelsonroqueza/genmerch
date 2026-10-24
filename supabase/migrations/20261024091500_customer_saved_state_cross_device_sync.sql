-- GENMERCH signed-in customer draft sync: cart, checkout form, selected payment, and address autocomplete context.
-- The JSON payload is private to the authenticated owner through RLS.
CREATE TABLE IF NOT EXISTS public.customer_saved_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_saved_state_json_object_check CHECK (jsonb_typeof(draft_state) = 'object')
);

ALTER TABLE public.customer_saved_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_saved_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_saved_state TO authenticated;

DROP POLICY IF EXISTS customer_saved_state_select_own ON public.customer_saved_state;
CREATE POLICY customer_saved_state_select_own
  ON public.customer_saved_state FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_saved_state_insert_own ON public.customer_saved_state;
CREATE POLICY customer_saved_state_insert_own
  ON public.customer_saved_state FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS customer_saved_state_update_own ON public.customer_saved_state;
CREATE POLICY customer_saved_state_update_own
  ON public.customer_saved_state FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
