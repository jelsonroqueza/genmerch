-- Require a verified Supabase customer session for every live checkout entry point.
-- The legacy 13-argument implementation is internal to the 14-argument receipt-email wrapper.
DO $migration$
DECLARE
  v_base regprocedure := 'public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_wrapper regprocedure := 'public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(v_base) INTO v_definition;
  IF position('IF auth.uid() IS NULL THEN' IN v_definition) = 0 THEN
    v_updated := replace(
      v_definition,
      E'BEGIN\n  IF p_checkout_request_id IS NULL THEN',
      E'BEGIN\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION ''Please sign in or create a GENMERCH customer account before placing an order.'' USING ERRCODE = ''28000'';\n  END IF;\n\n  IF p_checkout_request_id IS NULL THEN'
    );
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Could not add customer-authentication guard to the core checkout function.';
    END IF;
    EXECUTE v_updated;
  END IF;

  SELECT pg_get_functiondef(v_wrapper) INTO v_definition;
  IF position('IF auth.uid() IS NULL THEN' IN v_definition) = 0 THEN
    v_updated := replace(
      v_definition,
      E'BEGIN\n  IF length(v_receipt_email)>254',
      E'BEGIN\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION ''Please sign in or create a GENMERCH customer account before placing an order.'' USING ERRCODE = ''28000'';\n  END IF;\n\n  IF length(v_receipt_email)>254'
    );
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Could not add customer-authentication guard to the receipt-email checkout wrapper.';
    END IF;
    EXECUTE v_updated;
  END IF;
END
$migration$;

-- Never expose the legacy no-receipt-email implementation as a client-callable RPC.
REVOKE ALL ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Only authenticated customer sessions may invoke the customer-facing checkout RPC.
REVOKE ALL ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  TO authenticated;
