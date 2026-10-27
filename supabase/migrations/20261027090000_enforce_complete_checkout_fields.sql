-- Enforce complete checkout data in the authenticated order-creation RPC.
-- Frontend validation gives field-level feedback; this server-side guard prevents
-- incomplete orders from bypassing browser validation.
DO $migration$
DECLARE
  v_wrapper regprocedure := 'public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_definition text;
  v_guard text := $guard$
  IF p_customer_name IS NULL
     OR cardinality(regexp_split_to_array(btrim(regexp_replace(p_customer_name, '\s+', ' ', 'g')), ' ')) < 2
     OR length(btrim(p_customer_name)) > 161
     OR p_customer_name !~ '^[[:alpha:][:space:]''’.-]+$' THEN
    RAISE EXCEPTION 'Enter both your first name and last name.';
  END IF;
  IF p_customer_phone IS NULL OR btrim(p_customer_phone) !~ '^09[0-9]{9}$' THEN
    RAISE EXCEPTION 'Enter a valid Philippine mobile number starting with 09 (11 digits).';
  END IF;
  IF nullif(btrim(p_shipping_street_address), '') IS NULL THEN RAISE EXCEPTION 'Enter your house/unit number and street.'; END IF;
  IF nullif(btrim(p_shipping_barangay), '') IS NULL THEN RAISE EXCEPTION 'Select your barangay.'; END IF;
  IF nullif(btrim(p_shipping_city_municipality), '') IS NULL THEN RAISE EXCEPTION 'Select your city or municipality.'; END IF;
  IF nullif(btrim(p_shipping_province), '') IS NULL THEN RAISE EXCEPTION 'Select your province.'; END IF;
  IF p_shipping_postal_code IS NULL OR btrim(p_shipping_postal_code) !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Enter a valid 4-digit postal code.'; END IF;
  IF nullif(btrim(p_shipping_landmark), '') IS NULL THEN RAISE EXCEPTION 'Enter a landmark or type N/A if none applies.'; END IF;
  IF nullif(btrim(p_delivery_instructions), '') IS NULL THEN RAISE EXCEPTION 'Enter delivery instructions or type N/A if none applies.'; END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('COD','GCash','Maya','Bank Transfer') THEN
    RAISE EXCEPTION 'Choose a valid preferred payment method.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty. Add a product before placing an order.';
  END IF;

$guard$;
BEGIN
  SELECT pg_get_functiondef(v_wrapper) INTO v_definition;
  IF position('Choose a valid preferred payment method.' IN v_definition) > 0 THEN
    RAISE NOTICE 'Complete checkout validation already exists; no change needed.';
    RETURN;
  END IF;
  IF position('IF length(v_receipt_email)>254' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate the receipt email validation anchor; checkout function was not changed.';
  END IF;
  v_definition := replace(v_definition, '  IF length(v_receipt_email)>254', v_guard || '  IF length(v_receipt_email)>254');
  EXECUTE v_definition;
END
$migration$;
