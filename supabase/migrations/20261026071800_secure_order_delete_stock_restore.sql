-- Securely delete test/demo or incorrect orders while reconciling inventory.
-- Deleted-order audit and stock movement records are retained for accountability.

CREATE TABLE IF NOT EXISTS public.order_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id uuid NOT NULL,
  order_number text NOT NULL,
  previous_status text NOT NULL,
  previous_payment_status text NOT NULL,
  payment_method text,
  total_amount numeric NOT NULL,
  delete_reason text NOT NULL,
  deleted_by uuid,
  restored_stock_units integer NOT NULL DEFAULT 0 CHECK (restored_stock_units >= 0),
  deleted_item_count integer NOT NULL DEFAULT 0 CHECK (deleted_item_count >= 0),
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_deletion_audit_deleted_at_idx
  ON public.order_deletion_audit (deleted_at DESC);

ALTER TABLE public.order_deletion_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_deletion_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_deletion_audit TO authenticated;
DROP POLICY IF EXISTS genmerch_admin_read_order_deletion_audit ON public.order_deletion_audit;
CREATE POLICY genmerch_admin_read_order_deletion_audit
  ON public.order_deletion_audit
  FOR SELECT TO authenticated
  USING (public.is_genmerch_admin());

CREATE OR REPLACE FUNCTION public.delete_genmerch_order(
  p_order_id uuid,
  p_confirmation_order_number text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  deleted_order_id uuid,
  deleted_order_number text,
  restored_stock_units integer,
  deleted_item_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order record;
  v_item record;
  v_stock_before integer;
  v_stock_after integer;
  v_restored_stock_units integer := 0;
  v_deleted_item_count integer := 0;
  v_reason text;
  v_items_snapshot jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to delete orders.' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Select an order first.';
  END IF;

  SELECT o.id, o.order_number, o.status, o.payment_status, o.payment_method,
         o.total_amount, o.inventory_reserved, o.inventory_released
    INTO v_order
    FROM public.orders AS o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found. Refresh Orders and try again.';
  END IF;

  IF p_confirmation_order_number IS NULL
     OR btrim(p_confirmation_order_number) IS DISTINCT FROM v_order.order_number THEN
    RAISE EXCEPTION 'Order number confirmation did not match. No changes were made.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.payment_transactions AS pt
     WHERE pt.order_id = p_order_id
       AND pt.status = 'succeeded'
       AND pt.provider <> 'manual_seller_settlement'
  ) THEN
    RAISE EXCEPTION 'This order has a successful external payment transaction. Refund or reconcile it with the payment provider before deleting the order.';
  END IF;

  SELECT count(*)::integer
    INTO v_deleted_item_count
    FROM public.order_items AS oi
   WHERE oi.order_id = p_order_id;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'product_name', oi.product_name,
               'sku', oi.sku,
               'size_label', oi.size_label,
               'color_label', oi.color_label,
               'variant_id', oi.variant_id,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price,
               'line_total', oi.line_total
             ) ORDER BY oi.created_at
           ),
           '[]'::jsonb
         )
    INTO v_items_snapshot
    FROM public.order_items AS oi
   WHERE oi.order_id = p_order_id;

  v_reason := left(
    COALESCE(NULLIF(btrim(p_reason), ''), 'Test/demo order or erroneous order removed by Seller Centre administrator')
    || ' | Order ' || v_order.order_number,
    500
  );

  IF v_order.inventory_reserved IS TRUE AND v_order.inventory_released IS FALSE THEN
    IF EXISTS (
      SELECT 1
        FROM public.order_items AS oi
        LEFT JOIN public.product_variants AS pv ON pv.id = oi.variant_id
       WHERE oi.order_id = p_order_id
         AND (oi.variant_id IS NULL OR pv.id IS NULL)
    ) THEN
      RAISE EXCEPTION 'Cannot safely delete this order because a reserved item no longer points to an inventory variant. Reconcile that stock before deleting.';
    END IF;

    FOR v_item IN
      SELECT oi.variant_id, sum(oi.quantity)::integer AS quantity,
             max(oi.product_name) AS product_name,
             max(oi.sku) AS sku,
             max(oi.size_label) AS size_label,
             max(oi.color_label) AS color_label
        FROM public.order_items AS oi
       WHERE oi.order_id = p_order_id
         AND oi.variant_id IS NOT NULL
       GROUP BY oi.variant_id
       ORDER BY oi.variant_id
    LOOP
      SELECT pv.stock_quantity
        INTO v_stock_before
        FROM public.product_variants AS pv
       WHERE pv.id = v_item.variant_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'An inventory variant disappeared during deletion. No changes were committed.';
      END IF;

      IF v_item.quantity < 1 OR v_stock_before > 2147483647 - v_item.quantity THEN
        RAISE EXCEPTION 'The stock quantity for a deleted order cannot be safely restored. No changes were committed.';
      END IF;

      UPDATE public.product_variants AS pv
         SET stock_quantity = v_stock_before + v_item.quantity,
             updated_at = now()
       WHERE pv.id = v_item.variant_id
      RETURNING pv.stock_quantity INTO v_stock_after;

      INSERT INTO public.inventory_movements (
        variant_id, order_id, movement_type, quantity_delta,
        stock_before, stock_after, reason, actor_id,
        product_name_snapshot, variant_sku_snapshot,
        size_label_snapshot, color_label_snapshot
      ) VALUES (
        v_item.variant_id, p_order_id, 'cancellation_return', v_item.quantity,
        v_stock_before, v_stock_after, v_reason, auth.uid(),
        v_item.product_name, v_item.sku, v_item.size_label, v_item.color_label
      );

      v_restored_stock_units := v_restored_stock_units + v_item.quantity;
    END LOOP;
  END IF;

  INSERT INTO public.order_deletion_audit (
    original_order_id, order_number, previous_status, previous_payment_status,
    payment_method, total_amount, delete_reason, deleted_by,
    restored_stock_units, deleted_item_count, items_snapshot
  ) VALUES (
    v_order.id, v_order.order_number, v_order.status, v_order.payment_status,
    v_order.payment_method, v_order.total_amount, v_reason, auth.uid(),
    v_restored_stock_units, v_deleted_item_count, v_items_snapshot
  );

  DELETE FROM public.orders AS o WHERE o.id = p_order_id;

  RETURN QUERY
    SELECT p_order_id, v_order.order_number, v_restored_stock_units, v_deleted_item_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_genmerch_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_genmerch_order(uuid, text, text) TO authenticated;
