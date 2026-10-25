-- Make permanent product deletion robust when the item exists in a customer's active or saved cart.
-- Preserve completed order-item and inventory-movement snapshots.

CREATE OR REPLACE FUNCTION public.delete_genmerch_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_name text;
  v_preserved_order_items integer := 0;
  v_preserved_movements integer := 0;
  v_removed_cart_items integer := 0;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to permanently delete products.' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Select a product to delete.';
  END IF;

  SELECT p.name INTO v_product_name
    FROM public.products p
   WHERE p.id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product has already been deleted or no longer exists.';
  END IF;

  SELECT count(*)::integer INTO v_preserved_order_items
    FROM public.order_items oi
   WHERE oi.product_id = p_product_id
      OR oi.variant_id IN (SELECT v.id FROM public.product_variants v WHERE v.product_id = p_product_id);

  SELECT count(*)::integer INTO v_preserved_movements
    FROM public.inventory_movements m
   WHERE m.variant_id IN (SELECT v.id FROM public.product_variants v WHERE v.product_id = p_product_id);

  -- Cart items have a restrictive FK to variants; remove them so deletion cannot leave an unavailable item in a customer's cart.
  DELETE FROM public.cart_items ci
   WHERE ci.variant_id IN (SELECT v.id FROM public.product_variants v WHERE v.product_id = p_product_id);
  GET DIAGNOSTICS v_removed_cart_items = ROW_COUNT;

  -- Keep order-line snapshots for historical receipts/reports; unlink live catalog FKs.
  UPDATE public.order_items oi
     SET product_id = NULL,
         variant_id = NULL
   WHERE oi.product_id = p_product_id
      OR oi.variant_id IN (SELECT v.id FROM public.product_variants v WHERE v.product_id = p_product_id);

  -- Product images, variants, and wishlist references are cleaned up through FK cascade.
  -- Inventory movement history preserves its snapshots while its variant link becomes NULL.
  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'deleted_product_id', p_product_id,
    'deleted_product_name', v_product_name,
    'preserved_order_items', v_preserved_order_items,
    'preserved_inventory_movements', v_preserved_movements,
    'removed_cart_items', v_removed_cart_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_genmerch_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_genmerch_product(uuid) TO authenticated;
