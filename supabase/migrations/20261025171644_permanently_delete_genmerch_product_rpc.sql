CREATE OR REPLACE FUNCTION public.permanently_delete_genmerch_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_name text;
  v_removed_cart_items integer := 0;
  v_deleted_products integer := 0;
  v_order_item_count integer := 0;
  v_movement_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to permanently delete products.'
      USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Select a product to permanently delete.';
  END IF;

  SELECT p.name
    INTO v_product_name
    FROM public.products AS p
   WHERE p.id = p_product_id
     AND p.is_deleted IS TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a product already in Deleted can be permanently deleted.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer
    INTO v_order_item_count
    FROM public.order_items AS oi
   WHERE oi.product_id = p_product_id
      OR oi.variant_id IN (
        SELECT pv.id
          FROM public.product_variants AS pv
         WHERE pv.product_id = p_product_id
      );

  SELECT count(*)::integer
    INTO v_movement_count
    FROM public.inventory_movements AS im
   WHERE im.variant_id IN (
     SELECT pv.id
       FROM public.product_variants AS pv
      WHERE pv.product_id = p_product_id
   );

  -- Remove stale customer cart rows before cascading product variants.
  DELETE FROM public.cart_items AS ci
   WHERE ci.variant_id IN (
     SELECT pv.id
       FROM public.product_variants AS pv
      WHERE pv.product_id = p_product_id
   );
  GET DIAGNOSTICS v_removed_cart_items = ROW_COUNT;

  -- Hard-delete only the archived product. Foreign-key rules preserve order
  -- items and inventory movement snapshots, while gallery rows and variants
  -- are removed by their declared ON DELETE CASCADE relationships.
  DELETE FROM public.products AS p
   WHERE p.id = p_product_id
     AND p.is_deleted IS TRUE;
  GET DIAGNOSTICS v_deleted_products = ROW_COUNT;

  IF v_deleted_products <> 1 THEN
    RAISE EXCEPTION 'The product was not deleted. Refresh Deleted products and try again.';
  END IF;

  RETURN jsonb_build_object(
    'deleted_product_id', p_product_id,
    'deleted_product_name', v_product_name,
    'removed_cart_items', v_removed_cart_items,
    'preserved_order_items', v_order_item_count,
    'preserved_inventory_movements', v_movement_count,
    'permanently_deleted', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.permanently_delete_genmerch_product(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.permanently_delete_genmerch_product(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.permanently_delete_genmerch_product(uuid) TO authenticated;
