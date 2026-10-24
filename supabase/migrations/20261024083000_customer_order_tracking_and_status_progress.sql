-- GENMERCH customer order tracking and seller-managed delivery status progression.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','refunded'
  ]));

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_history_to_status_check CHECK (
    to_status = ANY (ARRAY['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','refunded'])
  )
);

CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx
  ON public.order_status_history(order_id, created_at ASC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.order_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;

DROP POLICY IF EXISTS genmerch_admin_read_order_status_history ON public.order_status_history;
CREATE POLICY genmerch_admin_read_order_status_history
  ON public.order_status_history FOR SELECT TO authenticated
  USING (public.is_genmerch_admin());

DROP POLICY IF EXISTS genmerch_customer_read_own_order_status_history ON public.order_status_history;
CREATE POLICY genmerch_customer_read_own_order_status_history
  ON public.order_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION genmerch_private.record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_note := NULLIF(btrim(current_setting('genmerch.order_status_note', true)), '');
    INSERT INTO public.order_status_history(order_id,from_status,to_status,note,actor_user_id,created_at)
    VALUES (NEW.id,NULL,NEW.status,COALESCE(v_note,'Order placed'),auth.uid(),NEW.created_at);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_note := NULLIF(btrim(current_setting('genmerch.order_status_note', true)), '');
    INSERT INTO public.order_status_history(order_id,from_status,to_status,note,actor_user_id,created_at)
    VALUES (NEW.id,OLD.status,NEW.status,
      COALESCE(v_note,'Order status updated'),auth.uid(),now());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.record_order_status_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_order_status_history_insert ON public.orders;
CREATE TRIGGER genmerch_order_status_history_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION genmerch_private.record_order_status_history();

DROP TRIGGER IF EXISTS genmerch_order_status_history_update ON public.orders;
CREATE TRIGGER genmerch_order_status_history_update
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION genmerch_private.record_order_status_history();

CREATE OR REPLACE FUNCTION genmerch_private.guard_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF OLD.status='pending' AND NEW.status IN ('confirmed','processing','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='confirmed' AND NEW.status IN ('processing','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='processing' AND NEW.status IN ('shipped','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='shipped' AND NEW.status IN ('out_for_delivery','delivered') THEN RETURN NEW; END IF;
  IF OLD.status='out_for_delivery' AND NEW.status='delivered' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid order status transition: % → %. Follow the order progress steps in Seller Centre.',OLD.status,NEW.status
    USING ERRCODE='check_violation';
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.guard_order_status_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_guard_order_status_transition ON public.orders;
CREATE TRIGGER genmerch_guard_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION genmerch_private.guard_order_status_transition();

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
  IF v_new_status NOT IN ('confirmed','processing','shipped','out_for_delivery','delivered') THEN
    RAISE EXCEPTION 'Choose a valid next delivery status.';
  END IF;

  SELECT o.status,o.order_number INTO v_old_status,v_order_number
    FROM public.orders o WHERE o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  IF NOT (
    (v_old_status='pending' AND v_new_status='confirmed') OR
    (v_old_status='confirmed' AND v_new_status='processing') OR
    (v_old_status='processing' AND v_new_status='shipped') OR
    (v_old_status='shipped' AND v_new_status='out_for_delivery') OR
    (v_old_status='out_for_delivery' AND v_new_status='delivered')
  ) THEN
    RAISE EXCEPTION 'This order cannot move from % to %. Follow the next available step.',v_old_status,v_new_status;
  END IF;

  PERFORM set_config('genmerch.order_status_note',COALESCE(NULLIF(v_note,''),CASE v_new_status
    WHEN 'confirmed' THEN 'Order confirmed by seller'
    WHEN 'processing' THEN 'Seller is preparing to ship your order'
    WHEN 'shipped' THEN 'Order has been shipped'
    WHEN 'out_for_delivery' THEN 'Order is out for delivery'
    WHEN 'delivered' THEN 'Order received'
    ELSE 'Order status updated' END),true);

  UPDATE public.orders SET status=v_new_status WHERE id=p_order_id;
  RETURN jsonb_build_object(
    'order_id',p_order_id,'order_number',v_order_number,
    'previous_status',v_old_status,'status',v_new_status,'updated_at',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.update_genmerch_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_genmerch_order_status(uuid,text,text) TO authenticated;

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

  RETURN jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.order_number,'status',v_order.status,
    'payment_method',v_order.payment_method,'payment_status',v_order.payment_status,
    'subtotal',v_order.subtotal,'shipping_fee',v_order.shipping_fee,'total_amount',v_order.total_amount,
    'delivery_zone',v_order.delivery_zone,'created_at',v_order.created_at,'updated_at',v_order.updated_at,
    'items',v_items,'timeline',v_timeline
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.track_genmerch_guest_order(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_genmerch_guest_order(text,text) TO anon,authenticated;

-- Existing orders receive a baseline event so the customer timeline has a starting point.
INSERT INTO public.order_status_history(order_id,from_status,to_status,note,created_at)
SELECT o.id,NULL,o.status,'Tracking started',o.created_at
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_status_history h WHERE h.order_id=o.id
);
