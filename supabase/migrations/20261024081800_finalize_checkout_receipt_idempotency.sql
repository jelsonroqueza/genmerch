-- Finalize the live checkout RPC: consistent idempotent receipts and stricter payment validation.
CREATE OR REPLACE FUNCTION public.create_genmerch_order(
  p_checkout_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_shipping_street_address text,
  p_shipping_barangay text,
  p_shipping_city_municipality text,
  p_shipping_province text,
  p_shipping_postal_code text,
  p_shipping_landmark text,
  p_delivery_instructions text,
  p_payment_method text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_existing_phone text;
  v_existing_total numeric;
  v_existing_subtotal numeric;
  v_existing_shipping numeric;
  v_existing_zone text;
  v_existing_method text;
  v_existing_payment_status text;
  v_existing_item_count integer;
  v_customer_name text := btrim(coalesce(p_customer_name, ''));
  v_customer_phone text := btrim(coalesce(p_customer_phone, ''));
  v_customer_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_street text := btrim(coalesce(p_shipping_street_address, ''));
  v_barangay text := btrim(coalesce(p_shipping_barangay, ''));
  v_city text := btrim(coalesce(p_shipping_city_municipality, ''));
  v_province text := btrim(coalesce(p_shipping_province, ''));
  v_postal text := btrim(coalesce(p_shipping_postal_code, ''));
  v_zone text;
  v_shipping_fee numeric;
  v_subtotal numeric := 0;
  v_line_count integer;
  v_line jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_product_name text;
  v_variant_sku text;
  v_size_label text;
  v_color_label text;
  v_product_active boolean;
  v_variant_active boolean;
  v_stock integer;
  v_unit_price numeric;
  v_image_url text;
  v_seen_variants uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_checkout_request_id IS NULL THEN
    RAISE EXCEPTION 'Checkout request is missing. Please retry checkout.';
  END IF;

  -- A network retry returns the exact saved receipt rather than creating a duplicate order.
  SELECT o.id,o.order_number,o.customer_phone,o.total_amount,o.payment_method,o.payment_status,
         o.subtotal,o.shipping_fee,o.delivery_zone,
         (SELECT count(*)::integer FROM public.order_items oi WHERE oi.order_id=o.id)
    INTO v_order_id,v_order_number,v_existing_phone,v_existing_total,v_existing_method,v_existing_payment_status,
         v_existing_subtotal,v_existing_shipping,v_existing_zone,v_existing_item_count
    FROM public.orders o
   WHERE o.checkout_request_id=p_checkout_request_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing_phone IS DISTINCT FROM v_customer_phone THEN
      RAISE EXCEPTION 'This checkout reference has already been used. Refresh checkout and try again.';
    END IF;
    RETURN jsonb_build_object(
      'order_id',v_order_id,'order_number',v_order_number,
      'subtotal',v_existing_subtotal,'shipping_fee',v_existing_shipping,'total_amount',v_existing_total,
      'delivery_zone',v_existing_zone,'payment_method',v_existing_method,
      'payment_status',v_existing_payment_status,'item_count',v_existing_item_count,'replayed',true
    );
  END IF;

  IF length(v_customer_name)<2 OR length(v_customer_name)>120 THEN
    RAISE EXCEPTION 'Enter the recipient''s full name (2–120 characters).';
  END IF;
  IF v_customer_phone !~ '^09[0-9]{9}$' THEN
    RAISE EXCEPTION 'Enter a valid Philippine mobile number starting with 09 (11 digits).';
  END IF;
  IF length(v_street)<3 OR length(v_street)>250 THEN RAISE EXCEPTION 'Enter a valid house/unit number and street.'; END IF;
  IF length(v_barangay)<2 OR length(v_barangay)>150 THEN RAISE EXCEPTION 'Enter a valid barangay.'; END IF;
  IF length(v_city)<2 OR length(v_city)>150 THEN RAISE EXCEPTION 'Enter a valid city or municipality.'; END IF;
  IF length(v_province)<2 OR length(v_province)>150 THEN RAISE EXCEPTION 'Enter a valid province or region.'; END IF;
  IF v_postal !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Enter a valid four-digit postal code.'; END IF;
  IF v_customer_email IS NOT NULL AND (length(v_customer_email)>254 OR v_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION 'The signed-in email address is invalid. Please update your account and retry.';
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('COD','GCash','Maya','Bank Transfer') THEN
    RAISE EXCEPTION 'Select a supported payment method.';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Your cart is invalid. Refresh the cart and try again.'; END IF;
  v_line_count := jsonb_array_length(p_items);
  IF v_line_count<1 OR v_line_count>50 THEN RAISE EXCEPTION 'Your cart must contain between 1 and 50 distinct product variants.'; END IF;

  v_zone := genmerch_private.zone_for_province(v_province);
  IF v_zone IS NULL THEN
    RAISE EXCEPTION 'We could not determine the delivery zone for "%". Please reselect the province from the address suggestions.',v_province;
  END IF;
  v_shipping_fee := CASE v_zone WHEN 'Luzon' THEN 50 WHEN 'Visayas' THEN 100 WHEN 'Mindanao' THEN 120 END;

  -- Server-authoritative prices/availability; lock the selected variants until transaction commit.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_variant_id := (v_line->>'variant_id')::uuid;
      v_quantity := (v_line->>'quantity')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'A cart item is missing its product, size variant, or quantity. Refresh the cart and try again.';
    END;
    IF v_product_id IS NULL OR v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity<1 OR v_quantity>50 THEN
      RAISE EXCEPTION 'A cart item has an invalid size or quantity.';
    END IF;
    IF v_variant_id=ANY(v_seen_variants) THEN
      RAISE EXCEPTION 'Your cart has a duplicate size line. Refresh your cart and retry.';
    END IF;
    v_seen_variants := array_append(v_seen_variants,v_variant_id);

    SELECT p.name,p.is_active,v.sku,v.size_label,v.color_label,v.is_active,
           v.stock_quantity,COALESCE(v.price_override,p.base_price),
           (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_primary DESC,pi.sort_order ASC,pi.created_at ASC LIMIT 1)
      INTO v_product_name,v_product_active,v_variant_sku,v_size_label,v_color_label,v_variant_active,
           v_stock,v_unit_price,v_image_url
      FROM public.products p
      JOIN public.product_variants v ON v.product_id=p.id
     WHERE p.id=v_product_id AND v.id=v_variant_id
     FOR UPDATE OF p,v;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product or size in your cart is no longer available. Refresh your cart.'; END IF;
    IF NOT v_product_active OR NOT v_variant_active THEN RAISE EXCEPTION '"%" (size %) is no longer available. Refresh your cart.',v_product_name,v_size_label; END IF;
    IF v_stock<v_quantity THEN RAISE EXCEPTION 'Not enough stock for "%" size %. Only % unit(s) remain.',v_product_name,v_size_label,v_stock; END IF;
    v_subtotal := v_subtotal + round(v_unit_price*v_quantity,2);
  END LOOP;

  INSERT INTO public.orders(
    user_id,customer_name,customer_email,customer_phone,status,payment_method,payment_status,currency,
    subtotal,shipping_fee,discount_amount,total_amount,shipping_province,shipping_city_municipality,
    shipping_barangay,shipping_postal_code,shipping_street_address,shipping_landmark,
    delivery_instructions,delivery_zone,customer_notes,checkout_request_id
  ) VALUES (
    auth.uid(),v_customer_name,v_customer_email,v_customer_phone,'pending',p_payment_method,'pending','PHP',
    v_subtotal,v_shipping_fee,0,v_subtotal+v_shipping_fee,v_province,v_city,
    v_barangay,v_postal,v_street,nullif(btrim(coalesce(p_shipping_landmark,'')),''),
    nullif(btrim(coalesce(p_delivery_instructions,'')),''),v_zone,'Preferred payment: '||p_payment_method,p_checkout_request_id
  ) RETURNING id,order_number INTO v_order_id,v_order_number;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_variant_id := (v_line->>'variant_id')::uuid;
    v_quantity := (v_line->>'quantity')::integer;
    INSERT INTO public.order_items(
      order_id,product_id,variant_id,product_name,sku,size_label,color_label,unit_price,quantity,line_total,image_url_snapshot
    )
    SELECT v_order_id,p.id,v.id,p.name,v.sku,v.size_label,v.color_label,
           COALESCE(v.price_override,p.base_price),v_quantity,
           round(COALESCE(v.price_override,p.base_price)*v_quantity,2),
           (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_primary DESC,pi.sort_order ASC,pi.created_at ASC LIMIT 1)
      FROM public.products p JOIN public.product_variants v ON v.product_id=p.id
     WHERE p.id=v_product_id AND v.id=v_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'A product in your cart changed while checkout was processing. No order was placed.'; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id',v_order_id,'order_number',v_order_number,
    'subtotal',v_subtotal,'shipping_fee',v_shipping_fee,'total_amount',v_subtotal+v_shipping_fee,
    'delivery_zone',v_zone,'payment_method',p_payment_method,'payment_status','pending',
    'item_count',v_line_count,'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb) TO anon,authenticated;
