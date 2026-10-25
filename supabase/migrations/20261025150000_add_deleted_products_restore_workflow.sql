-- Soft-delete products so sellers can restore them without re-uploading images.
-- Deleted products are inactive and excluded from public catalog; their image records
-- and storage objects remain intact. Restored products are active with zero stock.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS products_deleted_lookup_idx
  ON public.products (is_deleted, deleted_at DESC);

CREATE OR REPLACE FUNCTION public.delete_genmerch_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_name text;
  v_is_deleted boolean;
  v_preserved_order_items integer := 0;
  v_preserved_movements integer := 0;
  v_removed_cart_items integer := 0;
  v_variant record;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to move products to Deleted.' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Select a product to delete.';
  END IF;

  SELECT p.name, p.is_deleted
    INTO v_product_name, v_is_deleted
    FROM public.products p
   WHERE p.id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product no longer exists.';
  END IF;
  IF v_is_deleted THEN
    RAISE EXCEPTION 'This product is already in Deleted.';
  END IF;

  SELECT count(*)::integer INTO v_preserved_order_items
    FROM public.order_items oi
   WHERE oi.product_id = p_product_id
      OR oi.variant_id IN (SELECT pv.id FROM public.product_variants pv WHERE pv.product_id = p_product_id);

  SELECT count(*)::integer INTO v_preserved_movements
    FROM public.inventory_movements im
   WHERE im.variant_id IN (SELECT pv.id FROM public.product_variants pv WHERE pv.product_id = p_product_id);

  -- Remove stale cart rows for variants of this product; completed orders are not touched.
  DELETE FROM public.cart_items ci
   WHERE ci.variant_id IN (SELECT pv.id FROM public.product_variants pv WHERE pv.product_id = p_product_id);
  GET DIAGNOSTICS v_removed_cart_items = ROW_COUNT;

  -- Reset any remaining stock to zero and record each adjustment in the audit history.
  FOR v_variant IN
    SELECT pv.id, pv.sku, pv.size_label, pv.color_label, pv.stock_quantity
      FROM public.product_variants pv
     WHERE pv.product_id = p_product_id
     FOR UPDATE
  LOOP
    IF v_variant.stock_quantity > 0 THEN
      INSERT INTO public.inventory_movements
        (variant_id, movement_type, quantity_delta, stock_before, stock_after, reason, actor_id,
         product_name_snapshot, variant_sku_snapshot, size_label_snapshot, color_label_snapshot)
      VALUES
        (v_variant.id, 'adjustment', -v_variant.stock_quantity, v_variant.stock_quantity, 0,
         'Product moved to Deleted; stock reset to zero for future restore', auth.uid(),
         v_product_name, v_variant.sku, v_variant.size_label, v_variant.color_label);

      UPDATE public.product_variants
         SET stock_quantity = 0, updated_at = now()
       WHERE id = v_variant.id;
    END IF;
  END LOOP;

  -- Soft delete only: preserve product, variants, image rows, and uploaded image files.
  UPDATE public.products
     SET is_deleted = true, deleted_at = now(), is_active = false, updated_at = now()
   WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'deleted_product_id', p_product_id,
    'deleted_product_name', v_product_name,
    'preserved_order_items', v_preserved_order_items,
    'preserved_inventory_movements', v_preserved_movements,
    'removed_cart_items', v_removed_cart_items,
    'images_preserved', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_genmerch_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_name text;
  v_is_deleted boolean;
BEGIN
  IF NOT public.is_genmerch_admin() THEN
    RAISE EXCEPTION 'Admin access required to restore products.' USING ERRCODE = '42501';
  END IF;
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Select a product to restore.';
  END IF;

  SELECT p.name, p.is_deleted
    INTO v_product_name, v_is_deleted
    FROM public.products p
   WHERE p.id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product no longer exists.';
  END IF;
  IF NOT v_is_deleted THEN
    RAISE EXCEPTION 'This product is not in Deleted.';
  END IF;

  -- Re-list the saved product, preserving the existing photo gallery and product details.
  UPDATE public.products
     SET is_deleted = false, deleted_at = NULL, is_active = true, updated_at = now()
   WHERE id = p_product_id;

  -- Restored products deliberately start out of stock; the seller can restock afterward.
  UPDATE public.product_variants
     SET stock_quantity = 0, updated_at = now()
   WHERE product_id = p_product_id;

  RETURN jsonb_build_object(
    'restored_product_id', p_product_id,
    'restored_product_name', v_product_name,
    'stock_quantity', 0,
    'images_preserved', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_genmerch_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_genmerch_product(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_genmerch_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_genmerch_product(uuid) TO authenticated;

COMMIT;
