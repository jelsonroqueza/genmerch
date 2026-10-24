-- Persist order receipt email atomically with checkout and prevent recipient substitution.

CREATE OR REPLACE FUNCTION public.create_genmerch_order(
  p_checkout_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_receipt_email text,
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
  v_receipt_email text := lower(btrim(coalesce(p_receipt_email,'')));
  v_result jsonb;
  v_order_id uuid;
  v_existing_receipt_email text;
BEGIN
  IF length(v_receipt_email)>254
     OR v_receipt_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
    RAISE EXCEPTION 'Enter a valid email address for your order confirmation.';
  END IF;

  v_result := public.create_genmerch_order(
    p_checkout_request_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_shipping_street_address,
    p_shipping_barangay,
    p_shipping_city_municipality,
    p_shipping_province,
    p_shipping_postal_code,
    p_shipping_landmark,
    p_delivery_instructions,
    p_payment_method,
    p_items
  );

  v_order_id := (v_result->>'order_id')::uuid;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Order creation did not return an order ID.'; END IF;

  SELECT lower(o.receipt_email)
    INTO v_existing_receipt_email
    FROM public.orders o
   WHERE o.id=v_order_id
   FOR UPDATE;

  IF v_existing_receipt_email IS NOT NULL AND v_existing_receipt_email IS DISTINCT FROM v_receipt_email THEN
    RAISE EXCEPTION 'This checkout reference already has a different order email. Start a fresh checkout to change it.';
  END IF;

  IF v_existing_receipt_email IS NULL THEN
    UPDATE public.orders SET receipt_email=v_receipt_email WHERE id=v_order_id;
  END IF;

  RETURN v_result || jsonb_build_object('receipt_email',v_receipt_email);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.reserve_genmerch_order_confirmation_email(
  p_order_id uuid,p_order_number text,p_customer_phone text,p_recipient_email text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_notification public.order_email_notifications%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_recipient_email,'')));
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role access required.' USING ERRCODE='42501'; END IF;
  IF p_order_id IS NULL OR length(btrim(coalesce(p_order_number,'')))<8 OR length(btrim(coalesce(p_order_number,'')))>40
     OR btrim(coalesce(p_customer_phone,'')) !~ '^09[0-9]{9}$'
     OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
    RAISE EXCEPTION 'Valid order details, mobile number, and recipient email are required.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text,0));
  SELECT o.* INTO v_order FROM public.orders o
   WHERE o.id=p_order_id AND upper(o.order_number)=upper(btrim(p_order_number))
     AND o.customer_phone=btrim(p_customer_phone)
     AND lower(o.receipt_email)=v_email
     AND o.created_at>=now()-interval '48 hours'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order details could not be verified for the selected receipt email.';
  END IF;

  SELECT n.* INTO v_notification FROM public.order_email_notifications n WHERE n.order_id=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_notification.status='sent' THEN
      RETURN jsonb_build_object('status','sent','already_sent',true,'recipient_email',v_notification.recipient_email,'provider_message_id',v_notification.provider_message_id);
    END IF;
    IF v_notification.status='sending' THEN
      RETURN jsonb_build_object('status','sending','already_sending',true,'recipient_email',v_notification.recipient_email);
    END IF;
    IF v_notification.attempts>=3 THEN RAISE EXCEPTION 'The email send limit for this order has been reached.'; END IF;
    UPDATE public.order_email_notifications SET recipient_email=v_email,status='sending',attempts=attempts+1,last_error=NULL,updated_at=now()
     WHERE order_id=p_order_id RETURNING * INTO v_notification;
  ELSE
    INSERT INTO public.order_email_notifications(order_id,recipient_email,status,attempts)
    VALUES(p_order_id,v_email,'sending',1) RETURNING * INTO v_notification;
  END IF;
  RETURN jsonb_build_object('status','sending','already_sending',false,'recipient_email',v_email,'attempts',v_notification.attempts);
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text) TO service_role;
