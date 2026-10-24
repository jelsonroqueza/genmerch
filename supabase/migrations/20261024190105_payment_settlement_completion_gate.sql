-- Require settled payment before delivery completion or customer receipt confirmation.
-- Manual settlement is an explicit admin assertion and is recorded in payment_transactions.

CREATE OR REPLACE FUNCTION genmerch_private.guard_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'delivered' AND COALESCE(NEW.payment_status, 'pending') <> 'paid' THEN
    RAISE EXCEPTION 'Payment must be settled before an order can be marked as received.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status='pending' AND NEW.status IN ('confirmed','processing','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='confirmed' AND NEW.status IN ('processing','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='processing' AND NEW.status IN ('shipped','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='shipped' AND NEW.status IN ('out_for_delivery','delivered') THEN RETURN NEW; END IF;
  IF OLD.status='out_for_delivery' AND NEW.status='delivered' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid order status transition: % → %. Follow the order progress steps in Seller Centre.',OLD.status,NEW.status
    USING ERRCODE='check_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_genmerch_order_payment(p_order_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  IF NOT public.is_genmerch_admin() THEN
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
  INSERT INTO public.payment_transactions(order_id,provider,provider_reference,amount,currency,status,provider_metadata,created_at,updated_at)
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_status text; v_payment_status text; v_order_number text;
BEGIN
  IF NOT public.is_genmerch_admin() THEN RAISE EXCEPTION 'Admin access required to complete delivery.' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.confirm_genmerch_order_received(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_status text; v_payment_status text; v_user_id uuid; v_order_number text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to confirm receipt of this account order.' USING ERRCODE='42501'; END IF;
  SELECT o.status,o.payment_status,o.user_id,o.order_number INTO v_status,v_payment_status,v_user_id,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This order is not linked to your signed-in account.' USING ERRCODE='42501';
  END IF;
  IF v_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Awaiting seller to confirm payment. Receipt confirmation becomes available after payment is marked Paid.';
  END IF;
  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','already_confirmed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'You can confirm receipt once the order is in transit or out for delivery.';
  END IF;
  PERFORM set_config('genmerch.order_status_note','Customer confirmed receipt after payment was settled',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=p_order_id;
  UPDATE public.shipments SET status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE order_id=p_order_id;
  RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','payment_status',v_payment_status,'updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_genmerch_order_received(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_genmerch_order_received(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_genmerch_guest_order_received(p_order_number text,p_customer_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_order_id uuid; v_order_number text; v_status text; v_payment_status text;
BEGIN
  IF length(btrim(coalesce(p_order_number,'')))<8 OR length(btrim(coalesce(p_order_number,'')))>40
     OR btrim(coalesce(p_customer_phone,'')) !~ '^09[0-9]{9}$' THEN
    RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.';
  END IF;
  SELECT o.id,o.order_number,o.status,o.payment_status INTO v_order_id,v_order_number,v_status,v_payment_status
    FROM public.orders o
   WHERE upper(o.order_number)=upper(btrim(p_order_number)) AND o.customer_phone=btrim(p_customer_phone)
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.'; END IF;
  IF v_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Awaiting seller to confirm payment. Receipt confirmation becomes available after payment is marked Paid.';
  END IF;
  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'status','delivered','already_confirmed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'You can confirm receipt once the order is in transit or out for delivery.';
  END IF;
  PERFORM set_config('genmerch.order_status_note','Customer confirmed receipt after payment was settled',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=v_order_id;
  UPDATE public.shipments SET status='delivered',delivered_at=COALESCE(delivered_at,now()),updated_at=now() WHERE order_id=v_order_id;
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'status','delivered','payment_status',v_payment_status,'updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_genmerch_guest_order_received(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_genmerch_guest_order_received(text,text) TO anon,authenticated;
