-- GENMERCH permanent product deletion while preserving order and stock-movement snapshots.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS variant_sku_snapshot text,
  ADD COLUMN IF NOT EXISTS size_label_snapshot text,
  ADD COLUMN IF NOT EXISTS color_label_snapshot text;

UPDATE public.inventory_movements m
   SET product_name_snapshot = COALESCE(m.product_name_snapshot, p.name),
       variant_sku_snapshot = COALESCE(m.variant_sku_snapshot, v.sku),
       size_label_snapshot = COALESCE(m.size_label_snapshot, v.size_label),
       color_label_snapshot = COALESCE(m.color_label_snapshot, v.color_label)
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
 WHERE m.variant_id = v.id
   AND (m.product_name_snapshot IS NULL
     OR m.variant_sku_snapshot IS NULL
     OR m.size_label_snapshot IS NULL);

ALTER TABLE public.inventory_movements
  ALTER COLUMN variant_id DROP NOT NULL;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_variant_id_fkey;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION genmerch_private.snapshot_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    SELECT p.name, v.sku, v.size_label, v.color_label
      INTO NEW.product_name_snapshot, NEW.variant_sku_snapshot, NEW.size_label_snapshot, NEW.color_label_snapshot
      FROM public.product_variants v
      JOIN public.products p ON p.id = v.product_id
     WHERE v.id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION genmerch_private.snapshot_inventory_movement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS genmerch_snapshot_inventory_movement ON public.inventory_movements;
CREATE TRIGGER genmerch_snapshot_inventory_movement
  BEFORE INSERT OR UPDATE OF variant_id
  ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION genmerch_private.snapshot_inventory_movement();

CREATE OR REPLACE FUNCTION public.delete_genmerch_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_name text;
  v_preserved_order_items integer;
  v_preserved_movements integer;
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

  -- Keep order-line snapshots for historical receipts/reports; unlink live catalog FKs.
  UPDATE public.order_items oi
     SET product_id = NULL,
         variant_id = NULL
   WHERE oi.product_id = p_product_id
      OR oi.variant_id IN (SELECT v.id FROM public.product_variants v WHERE v.product_id = p_product_id);

  -- The movement trigger has already snapshotted product/variant details.
  -- ON DELETE SET NULL preserves history without keeping the product in inventory.
  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'deleted_product_id', p_product_id,
    'deleted_product_name', v_product_name,
    'preserved_order_items', v_preserved_order_items,
    'preserved_inventory_movements', v_preserved_movements
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_genmerch_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_genmerch_product(uuid) TO authenticated;

-- Clean up the four already-deactivated demo products shown in the Seller Centre.
-- Delete only if they have no order-line references or inventory movement history.
DELETE FROM public.products p
 WHERE p.id IN (
   'ce52940f-fd6a-425f-a330-32ac740994f5'::uuid,
   '744559a2-ca12-45fc-a547-eb90798b3717'::uuid,
   '0469a360-1b16-47f3-b2f6-e50143635bc9'::uuid,
   'bc447062-76fa-444d-8057-b98ec1092cf2'::uuid
 )
 AND p.is_active = false
 AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.product_id = p.id)
 AND NOT EXISTS (
   SELECT 1 FROM public.inventory_movements m
   JOIN public.product_variants v ON v.id = m.variant_id
   WHERE v.product_id = p.id
 );
