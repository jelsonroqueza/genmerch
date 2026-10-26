-- Expand the maximum number of product gallery images from 5 to 30.
-- Keep the existing per-product row lock and the function's restricted search_path.
CREATE OR REPLACE FUNCTION genmerch_private.enforce_product_gallery_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_image_count integer;
BEGIN
  PERFORM 1
    FROM public.products
   WHERE id = NEW.product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The product for this image does not exist.';
  END IF;

  SELECT count(*)::integer
    INTO v_image_count
    FROM public.product_images
   WHERE product_id = NEW.product_id
     AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

  IF v_image_count >= 30 THEN
    RAISE EXCEPTION 'A product gallery can contain no more than 30 images.';
  END IF;

  RETURN NEW;
END;
$function$;
