-- Keep manually restocked sizes from remaining silently invisible in the customer storefront.
-- The specific SANDO DEMO Small variant below has seven units but was inactive.
UPDATE public.product_variants
   SET is_active = true, updated_at = now()
 WHERE id = 'e18eaa57-95dd-4323-839e-693ac34eef37'::uuid
   AND product_id = 'b35ed8f2-b0b9-45b6-85c7-6d95d62a7ee2'::uuid
   AND size_label = 'Small'
   AND stock_quantity = 7
   AND is_active = false
   AND EXISTS (
     SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND p.name = 'SANDO DEMO'
        AND p.is_active = true
   );

-- Do not allow stock to be added to an inactive size; enable the size in Edit Product first.
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
  v_before integer;
  v_after integer;
  v_reason text;
  v_variant_active boolean;
  v_product_active boolean;
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

  SELECT pv.stock_quantity, pv.is_active, p.is_active
    INTO v_before, v_variant_active, v_product_active
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
   WHERE pv.id = p_variant_id
   FOR UPDATE OF pv;

  IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found.'; END IF;
  IF p_adjustment > 0 AND (NOT v_variant_active OR NOT v_product_active) THEN
    RAISE EXCEPTION 'This product or size is inactive. Enable it in Seller Centre > Products > Edit before adding stock.';
  END IF;
  IF v_before + p_adjustment < 0 THEN
    RAISE EXCEPTION 'Stock cannot be reduced below zero.';
  END IF;

  UPDATE public.product_variants
     SET stock_quantity = v_before + p_adjustment,
         updated_at = now()
   WHERE id = p_variant_id
  RETURNING stock_quantity INTO v_after;

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
