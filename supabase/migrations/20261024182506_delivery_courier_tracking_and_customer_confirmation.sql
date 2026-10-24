-- GENMERCH courier shipping workflow and customer delivery confirmation.
-- Uses the existing shipments table and status history; all writes are guarded by RPCs.

CREATE UNIQUE INDEX IF NOT EXISTS shipments_order_id_unique
  ON public.shipments(order_id);

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_courier_name_genmerch_check;
ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_courier_name_genmerch_check
  CHECK (
    courier_name IS NULL OR courier_name = ANY (ARRAY[
      'LBC','JRS','Lalamove','Grab','J&T','In-House Delivery (GenMerch)'
    ])
  );

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.shipments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shipments TO authenticated;

DROP POLICY IF EXISTS genmerch_admin_read_shipments ON public.shipments;
CREATE POLICY genmerch_admin_read_shipments
  ON public.shipments FOR SELECT TO authenticated
  USING (public.is_genmerch_admin());

-- Only the admin can move a prepared order to shipped, and shipment details
-- (courier + delivery reference) are written atomically with the status change.
CREATE OR REPLACE FUNCTION public.mark_genmerch_order_shipped(
  p_order_id uuid,
  p_courier_name text,
  p_tracking_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_order_number text;
  v_courier text;
  v_reference text := btrim(coalesce(p_tracking_number, ''));
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to mark an order as shipped.' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Select an order first.'; END IF;

  v_courier := CASE lower(btrim(coalesce(p_courier_name, '')))
    WHEN 'lbc' THEN 'LBC'
    WHEN 'jrs' THEN 'JRS'
    WHEN 'lalamove' THEN 'Lalamove'
    WHEN 'grab' THEN 'Grab'
    WHEN 'j&t' THEN 'J&T'
    WHEN 'in-house delivery (genmerch)' THEN 'In-House Delivery (GenMerch)'
    ELSE NULL
  END;

  IF v_courier IS NULL THEN
    RAISE EXCEPTION 'Select a valid courier before marking the order as shipped.';
  END IF;
  IF length(v_reference) < 1 OR length(v_reference) > 100 THEN
    RAISE EXCEPTION 'Enter a delivery reference number (1–100 characters).';
  END IF;

  SELECT o.status, o.order_number
    INTO v_status, v_order_number
    FROM public.orders o
   WHERE o.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_status <> 'processing' THEN
    RAISE EXCEPTION 'Shipping setup is only available after the order is in Preparing Order status. Current status: %.', v_status;
  END IF;

  INSERT INTO public.shipments(
    order_id, courier_name, tracking_number, tracking_url, status, shipped_at, delivered_at, updated_at
  )
  VALUES (
    p_order_id, v_courier, v_reference, NULL, 'in_transit', now(), NULL, now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    courier_name = EXCLUDED.courier_name,
    tracking_number = EXCLUDED.tracking_number,
    tracking_url = NULL,
    status = 'in_transit',
    shipped_at = now(),
    delivered_at = NULL,
    updated_at = now();

  PERFORM set_config(
    'genmerch.order_status_note',
    format('In Transit via %s · Delivery Reference #: %s', v_courier, v_reference),
    true
  );

  UPDATE public.orders
     SET status = 'shipped', updated_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', 'shipped',
    'courier_name', v_courier,
    'tracking_number', v_reference,
    'updated_at', now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_genmerch_order_shipped(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_genmerch_order_shipped(uuid,text,text) TO authenticated;

-- Keep the ordinary admin progression deliberately narrower: preparing -> shipped
-- must use the courier setup RPC, and completion must use an explicit completion action.
CREATE OR REPLACE FUNCTION public.update_genmerch_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_status text;
  v_order_number text;
  v_new_status text := lower(btrim(coalesce(p_new_status,'')));
  v_note text := left(btrim(coalesce(p_note,'')),500);
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to update order status.' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Select an order first.'; END IF;
  IF v_new_status NOT IN ('confirmed','processing','out_for_delivery') THEN
    RAISE EXCEPTION 'Use the dedicated shipping setup or completion action for this delivery stage.';
  END IF;

  SELECT o.status,o.order_number INTO v_old_status,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  IF NOT (
    (v_old_status='pending' AND v_new_status='confirmed') OR
    (v_old_status='confirmed' AND v_new_status='processing') OR
    (v_old_status='shipped' AND v_new_status='out_for_delivery')
  ) THEN
    RAISE EXCEPTION 'This order cannot move from % to %. Follow the next available step.',v_old_status,v_new_status;
  END IF;

  PERFORM set_config(
    'genmerch.order_status_note',
    COALESCE(NULLIF(v_note,''),CASE v_new_status
      WHEN 'confirmed' THEN 'Order confirmed by seller'
      WHEN 'processing' THEN 'Preparing Order — seller is preparing the order'
      WHEN 'out_for_delivery' THEN 'Out for delivery'
      ELSE 'Order status updated'
    END),
    true
  );

  UPDATE public.orders SET status=v_new_status,updated_at=now() WHERE id=p_order_id;

  RETURN jsonb_build_object(
    'order_id',p_order_id,'order_number',v_order_number,
    'previous_status',v_old_status,'status',v_new_status,'updated_at',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.update_genmerch_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_genmerch_order_status(uuid,text,text) TO authenticated;

-- Admin manual override: allow completion after shipping without requiring an
-- extra courier scan. The database records the completion as a timeline event.
CREATE OR REPLACE FUNCTION public.complete_genmerch_order_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_order_number text;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to complete delivery.' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Select an order first.'; END IF;

  SELECT o.status,o.order_number INTO v_status,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','already_completed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'Delivery can be completed manually only after the order is shipped. Current status: %.',v_status;
  END IF;

  PERFORM set_config('genmerch.order_status_note','Delivery manually marked completed by Seller Centre administrator',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=p_order_id;
  UPDATE public.shipments
     SET status='delivered', delivered_at=COALESCE(delivered_at,now()), updated_at=now()
   WHERE order_id=p_order_id;

  RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_genmerch_order_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_genmerch_order_delivery(uuid) TO authenticated;

-- Customer confirmation for an authenticated customer; only the owner can
-- confirm their own order. The action is idempotent for an already delivered order.
CREATE OR REPLACE FUNCTION public.confirm_genmerch_order_received(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_user_id uuid;
  v_order_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to confirm receipt of this account order.' USING ERRCODE='42501';
  END IF;

  SELECT o.status,o.user_id,o.order_number INTO v_status,v_user_id,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This order is not linked to your signed-in account.' USING ERRCODE='42501';
  END IF;

  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','already_confirmed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'You can confirm receipt once the order is in transit or out for delivery.';
  END IF;

  PERFORM set_config('genmerch.order_status_note','Customer confirmed receipt',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=p_order_id;
  UPDATE public.shipments
     SET status='delivered', delivered_at=COALESCE(delivered_at,now()), updated_at=now()
   WHERE order_id=p_order_id;

  RETURN jsonb_build_object('order_id',p_order_id,'order_number',v_order_number,'status','delivered','updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_genmerch_order_received(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_genmerch_order_received(uuid) TO authenticated;

-- Guest orders are verified by both the unpredictable order number and checkout mobile.
CREATE OR REPLACE FUNCTION public.confirm_genmerch_guest_order_received(
  p_order_number text,
  p_customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_status text;
BEGIN
  IF length(btrim(coalesce(p_order_number,'')))<8
     OR length(btrim(coalesce(p_order_number,'')))>40
     OR btrim(coalesce(p_customer_phone,'')) !~ '^09[0-9]{9}$' THEN
    RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.';
  END IF;

  SELECT o.id,o.order_number,o.status
    INTO v_order_id,v_order_number,v_status
    FROM public.orders o
   WHERE upper(o.order_number)=upper(btrim(p_order_number))
     AND o.customer_phone=btrim(p_customer_phone)
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.';
  END IF;

  IF v_status='delivered' THEN
    RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'status','delivered','already_confirmed',true);
  END IF;
  IF v_status NOT IN ('shipped','out_for_delivery') THEN
    RAISE EXCEPTION 'You can confirm receipt once the order is in transit or out for delivery.';
  END IF;

  PERFORM set_config('genmerch.order_status_note','Customer confirmed receipt',true);
  UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=v_order_id;
  UPDATE public.shipments
     SET status='delivered', delivered_at=COALESCE(delivered_at,now()), updated_at=now()
   WHERE order_id=v_order_id;

  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'status','delivered','updated_at',now());
END;
$function$;
REVOKE ALL ON FUNCTION public.confirm_genmerch_guest_order_received(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_genmerch_guest_order_received(text,text) TO anon,authenticated;

-- Extend guest tracking payload with the shipment fields customer-facing UI needs.
CREATE OR REPLACE FUNCTION public.track_genmerch_guest_order(
  p_order_number text,
  p_customer_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_timeline jsonb;
  v_shipment jsonb;
BEGIN
  IF length(btrim(coalesce(p_order_number,'')))<8 OR length(btrim(coalesce(p_order_number,'')))>40
     OR btrim(coalesce(p_customer_phone,'')) !~ '^09[0-9]{9}$' THEN
    RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE upper(o.order_number)=upper(btrim(p_order_number))
     AND o.customer_phone=btrim(p_customer_phone)
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order details not found. Check the order number and mobile number.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_name',oi.product_name,'sku',oi.sku,'size_label',oi.size_label,
      'color_label',oi.color_label,'quantity',oi.quantity,'unit_price',oi.unit_price,
      'line_total',oi.line_total,'image_url_snapshot',oi.image_url_snapshot
    ) ORDER BY oi.created_at ASC),'[]'::jsonb)
    INTO v_items
    FROM public.order_items oi WHERE oi.order_id=v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'from_status',h.from_status,'to_status',h.to_status,'note',h.note,'created_at',h.created_at
    ) ORDER BY h.created_at ASC),'[]'::jsonb)
    INTO v_timeline
    FROM public.order_status_history h WHERE h.order_id=v_order.id;

  SELECT jsonb_build_object(
      'courier_name',s.courier_name,
      'tracking_number',s.tracking_number,
      'tracking_url',s.tracking_url,
      'status',s.status,
      'shipped_at',s.shipped_at,
      'delivered_at',s.delivered_at,
      'updated_at',s.updated_at
    )
    INTO v_shipment
    FROM public.shipments s
   WHERE s.order_id=v_order.id
   ORDER BY s.updated_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,
    'payment_method',v_order.payment_method,'payment_status',v_order.payment_status,
    'subtotal',v_order.subtotal,'shipping_fee',v_order.shipping_fee,'total_amount',v_order.total_amount,
    'delivery_zone',v_order.delivery_zone,'created_at',v_order.created_at,'updated_at',v_order.updated_at,
    'items',v_items,'timeline',v_timeline,'shipment',v_shipment
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.track_genmerch_guest_order(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_genmerch_guest_order(text,text) TO anon,authenticated;
