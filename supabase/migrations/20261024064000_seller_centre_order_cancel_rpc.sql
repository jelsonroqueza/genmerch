-- Admin-only order cancellation API. The stock-return trigger runs in the same transaction.
CREATE OR REPLACE FUNCTION public.cancel_genmerch_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (order_id uuid, order_number text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_order_number text;
  v_reason text;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to cancel orders.' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'An order must be selected.'; END IF;

  SELECT o.status, o.order_number
    INTO v_status, v_order_number
    FROM public.orders AS o
   WHERE o.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_status IN ('cancelled','refunded') THEN RAISE EXCEPTION 'This order is already cancelled or refunded.'; END IF;
  IF v_status IN ('shipped','delivered') THEN RAISE EXCEPTION 'A shipped or delivered order cannot be cancelled into sellable stock. Use a returns workflow.'; END IF;

  v_reason := COALESCE(NULLIF(btrim(p_reason), ''), 'Cancelled by Seller Centre administrator');
  UPDATE public.orders
     SET status = 'cancelled',
         cancellation_reason = left(v_reason, 500),
         updated_at = now()
   WHERE id = p_order_id
  RETURNING public.orders.id, public.orders.order_number, public.orders.status
       INTO order_id, order_number, status;

  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_genmerch_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_genmerch_order(uuid, text) TO authenticated;
