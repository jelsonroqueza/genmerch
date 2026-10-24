-- GENMERCH Inventory management, order stock reservation, cancellation returns, and gallery size guard.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_released boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('restock','adjustment','sale','cancellation_return')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  stock_before integer NOT NULL CHECK (stock_before >= 0),
  stock_after integer NOT NULL CHECK (stock_after >= 0),
  reason text NOT NULL,
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_variant_created_idx
  ON public.inventory_movements (variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx
  ON public.inventory_movements (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_movements FROM anon;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
DROP POLICY IF EXISTS genmerch_admin_read_inventory_movements ON public.inventory_movements;
CREATE POLICY genmerch_admin_read_inventory_movements
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.is_genmerch_admin());
DROP POLICY IF EXISTS genmerch_admin_insert_inventory_movements ON public.inventory_movements;
CREATE POLICY genmerch_admin_insert_inventory_movements
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.is_genmerch_admin());

CREATE OR REPLACE FUNCTION public.adjust_genmerch_stock(
  p_variant_id uuid,
  p_adjustment integer,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (variant_id uuid, previous_stock integer, new_stock integer)
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_product_id uuid;
  v_before integer;
  v_after integer;
  v_reason text;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required for inventory adjustments.' USING ERRCODE = '42501';
  END IF;
  IF p_variant_id IS NULL OR p_adjustment IS NULL OR p_adjustment = 0 THEN
    RAISE EXCEPTION 'Select a variant and a non-zero stock adjustment.';
  END IF;
  IF p_adjustment > 1000000 OR p_adjustment < -1000000 THEN
    RAISE EXCEPTION 'Stock adjustment is outside the allowed range.';
  END IF;
  UPDATE public.product_variants AS pv
     SET stock_quantity = pv.stock_quantity + p_adjustment,
         updated_at = now()
   WHERE pv.id = p_variant_id
     AND pv.stock_quantity + p_adjustment >= 0
  RETURNING pv.product_id, pv.stock_quantity - p_adjustment, pv.stock_quantity
       INTO v_product_id, v_before, v_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found or stock cannot be reduced below zero.';
  END IF;
  v_reason := COALESCE(NULLIF(btrim(p_reason), ''), CASE WHEN p_adjustment > 0 THEN 'Manual stock addition' ELSE 'Manual stock reduction' END);
  INSERT INTO public.inventory_movements
    (variant_id, movement_type, quantity_delta, stock_before, stock_after, reason, actor_id)
  VALUES
    (p_variant_id, CASE WHEN p_adjustment > 0 THEN 'restock' ELSE 'adjustment' END,
     p_adjustment, v_before, v_after, left(v_reason, 500), auth.uid());
  RETURN QUERY SELECT p_variant_id, v_before, v_after;
END;
$function$;
REVOKE ALL ON FUNCTION public.adjust_genmerch_stock(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_genmerch_stock(uuid, integer, text) TO authenticated;

CREATE SCHEMA IF NOT EXISTS genmerch_private;
REVOKE ALL ON SCHEMA genmerch_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION genmerch_private.reserve_order_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order_status text;
  v_inventory_released boolean;
  v_order_number text;
  v_before integer;
  v_after integer;
BEGIN
  IF NEW.variant_id IS NULL OR NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'Every order item must reference a product and a stock-tracked variant.';
  END IF;
  SELECT o.status, o.inventory_released, o.order_number
    INTO v_order_status, v_inventory_released, v_order_number
    FROM public.orders AS o WHERE o.id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The order for this order item does not exist.'; END IF;
  IF v_order_status = 'cancelled' OR v_inventory_released THEN
    RAISE EXCEPTION 'Cannot add items to a cancelled order whose stock has been released.';
  END IF;
  UPDATE public.product_variants AS v
     SET stock_quantity = v.stock_quantity - NEW.quantity, updated_at = now()
    FROM public.products AS p
   WHERE v.id = NEW.variant_id AND v.product_id = NEW.product_id
     AND p.id = v.product_id AND v.is_active = true AND p.is_active = true
     AND v.stock_quantity >= NEW.quantity
  RETURNING v.stock_quantity + NEW.quantity, v.stock_quantity INTO v_before, v_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or inactive product/variant for order %. Please refresh inventory and try again.', COALESCE(v_order_number, NEW.order_id::text)
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.inventory_movements
    (variant_id, order_id, movement_type, quantity_delta, stock_before, stock_after, reason, actor_id)
  VALUES
    (NEW.variant_id, NEW.order_id, 'sale', -NEW.quantity, v_before, v_after,
     'Stock reserved for order ' || COALESCE(v_order_number, NEW.order_id::text), auth.uid());
  UPDATE public.orders SET inventory_reserved = true WHERE id = NEW.order_id;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.reserve_order_item_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_reserve_stock_for_order_item ON public.order_items;
CREATE TRIGGER genmerch_reserve_stock_for_order_item
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION genmerch_private.reserve_order_item_stock();

CREATE OR REPLACE FUNCTION genmerch_private.release_cancelled_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item record;
  v_before integer;
  v_after integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelled' OR OLD.status IS NOT DISTINCT FROM 'cancelled' THEN RETURN NEW; END IF;
  IF OLD.status IN ('shipped','delivered') THEN
    RAISE EXCEPTION 'A shipped or delivered order cannot be cancelled into sellable stock. Use the returns workflow instead.';
  END IF;
  IF NEW.inventory_released THEN RETURN NEW; END IF;
  IF NEW.inventory_reserved THEN
    FOR v_item IN SELECT oi.variant_id, oi.quantity FROM public.order_items AS oi
      WHERE oi.order_id = NEW.id AND oi.variant_id IS NOT NULL
    LOOP
      UPDATE public.product_variants AS pv
         SET stock_quantity = pv.stock_quantity + v_item.quantity, updated_at = now()
       WHERE pv.id = v_item.variant_id
      RETURNING pv.stock_quantity - v_item.quantity, pv.stock_quantity INTO v_before, v_after;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cannot restore stock because an order variant no longer exists.'; END IF;
      INSERT INTO public.inventory_movements
        (variant_id, order_id, movement_type, quantity_delta, stock_before, stock_after, reason, actor_id)
      VALUES
        (v_item.variant_id, NEW.id, 'cancellation_return', v_item.quantity, v_before, v_after,
         'Stock returned because order ' || COALESCE(NEW.order_number, NEW.id::text) || ' was cancelled', auth.uid());
    END LOOP;
  END IF;
  UPDATE public.orders SET inventory_reserved = false, inventory_released = true WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.release_cancelled_order_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_return_stock_when_order_cancelled ON public.orders;
CREATE TRIGGER genmerch_return_stock_when_order_cancelled
  AFTER UPDATE OF status ON public.orders FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION genmerch_private.release_cancelled_order_stock();

CREATE OR REPLACE FUNCTION genmerch_private.prevent_reopening_released_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.inventory_released AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'This order has already released inventory and cannot be reopened.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.prevent_reopening_released_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_prevent_reopen_after_stock_release ON public.orders;
CREATE TRIGGER genmerch_prevent_reopen_after_stock_release
  BEFORE UPDATE OF status ON public.orders FOR EACH ROW
  EXECUTE FUNCTION genmerch_private.prevent_reopening_released_order();

CREATE OR REPLACE FUNCTION genmerch_private.enforce_product_gallery_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_image_count integer;
BEGIN
  PERFORM 1 FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The product for this image does not exist.'; END IF;
  SELECT count(*)::integer INTO v_image_count FROM public.product_images
   WHERE product_id = NEW.product_id AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
  IF v_image_count >= 5 THEN RAISE EXCEPTION 'A product gallery can contain no more than five images.'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.enforce_product_gallery_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_limit_product_gallery_to_five ON public.product_images;
CREATE TRIGGER genmerch_limit_product_gallery_to_five
  BEFORE INSERT ON public.product_images FOR EACH ROW
  EXECUTE FUNCTION genmerch_private.enforce_product_gallery_limit();
