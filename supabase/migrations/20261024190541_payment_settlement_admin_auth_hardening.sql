-- Require a real signed-in admin identity for payment settlement and manual delivery completion.
CREATE OR REPLACE FUNCTION public.settle_genmerch_order_payment(
  p_order_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_payment_status text;
  v_order_number text;
  v_total_amount numeric;
  v_payment_method text;
  v_note text := left(btrim(coalesce(p_note,'')),300);
  v_confirmed_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to settle an order payment.' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Select an order first.'; END IF;
  SELECT o.status,o.payment_status,o.order_number,o.total_amount,o.payment_method
    INTO v_status,v_payment_status,v_order_number,v_total_amount,v_payment_method
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_status IN ('cancelled','refunded') OR v_payment_status IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'Payment cannot be settled for a cancelled or refunded order.';
  END IF;
  IF v_payment_status='paid' THEN
    RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'payment_status','paid','already_settled',true);
  END IF;
  UPDATE public.orders SET payment_status='paid',updated_at=v_confirmed_at WHERE id=p_order_id;
  INSERT INTO public.payment_transactions(
    order_id,provider,provider_reference,amount,currency,status,provider_metadata,created_at,updated_at
  )
  VALUES(
    p_order_id,'manual_seller_settlement',NULL,v_total_amount,'PHP','succeeded',
    jsonb_build_object(
      'source','Seller Centre',
      'confirmation_method','manual_admin_confirmation',
      'confirmed_by',auth.uid(),
      'confirmed_at',v_confirmed_at,
      'payment_method',v_payment_method,
      'note',NULLIF(v_note,'')
    ),
    v_confirmed_at,v_confirmed_at
  );
  RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'payment_status','paid','updated_at',v_confirmed_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_genmerch_order_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_genmerch_order_payment(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_genmerch_order_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_status text; v_payment_status text; v_order_number text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to complete delivery.' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Select an order first.'; END IF;
  SELECT o.status,o.payment_status,o.order_number INTO v_status,v_payment_status,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Payment is not settled. Confirm that the seller has actually received the payment before completing this order.';
  END IF;
  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','already_completed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'Delivery can be completed manually only after the order is shipped. Current status: %.',v_status;
  END IF;
  PERFORM set_config('genmerch.order_status_note','Delivery manually marked completed by Seller Centre administrator after payment settlement',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=p_order_id;
  UPDATE public.shipments SET status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE order_id=p_order_id;
  RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','payment_status',v_payment_status,'updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_genmerch_order_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_genmerch_order_delivery(uuid) TO authenticated;