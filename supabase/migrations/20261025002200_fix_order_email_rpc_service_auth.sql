-- Fix order email RPC authorization for Supabase secret-key based service calls.
-- EXECUTE is already restricted to service_role; do not rely on request.jwt.claim.role
-- because Supabase secret API keys do not always populate that claim for PostgREST RPCs.

CREATE OR REPLACE FUNCTION public.reserve_genmerch_order_confirmation_email(
  p_order_id uuid,
  p_order_number text,
  p_customer_phone text,
  p_recipient_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_notification public.order_email_notifications%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_recipient_email,'')));
BEGIN
  IF p_order_id IS NULL
     OR length(btrim(coalesce(p_order_number,''))) < 8
     OR length(btrim(coalesce(p_order_number,''))) > 40
     OR btrim(coalesce(p_customer_phone,'')) !~ '^09[0-9]{9}$'
     OR length(v_email) > 254
     OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
    RAISE EXCEPTION 'Valid order details, mobile number, and recipient email are required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text,0));

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
     AND upper(o.order_number) = upper(btrim(p_order_number))
     AND o.customer_phone = btrim(p_customer_phone)
     AND lower(o.receipt_email) = v_email
     AND o.created_at >= now() - interval '48 hours'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order details could not be verified for the selected receipt email.';
  END IF;

  SELECT n.* INTO v_notification
    FROM public.order_email_notifications n
   WHERE n.order_id = p_order_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_notification.status = 'sent' THEN
      RETURN jsonb_build_object(
        'status','sent',
        'already_sent',true,
        'recipient_email',v_notification.recipient_email,
        'provider_message_id',v_notification.provider_message_id
      );
    END IF;

    IF v_notification.status = 'sending' THEN
      RETURN jsonb_build_object(
        'status','sending',
        'already_sending',true,
        'recipient_email',v_notification.recipient_email
      );
    END IF;

    IF v_notification.attempts >= 3 THEN
      RAISE EXCEPTION 'The email send limit for this order has been reached.';
    END IF;

    UPDATE public.order_email_notifications
       SET recipient_email = v_email,
           status = 'sending',
           attempts = attempts + 1,
           last_error = NULL,
           updated_at = now()
     WHERE order_id = p_order_id
     RETURNING * INTO v_notification;
  ELSE
    INSERT INTO public.order_email_notifications(order_id,recipient_email,status,attempts)
    VALUES(p_order_id,v_email,'sending',1)
    RETURNING * INTO v_notification;
  END IF;

  RETURN jsonb_build_object(
    'status','sending',
    'already_sending',false,
    'recipient_email',v_email,
    'attempts',v_notification.attempts
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text)
  TO service_role;


CREATE OR REPLACE FUNCTION public.finish_genmerch_order_confirmation_email(
  p_order_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_notification public.order_email_notifications%ROWTYPE;
  v_status text := lower(btrim(coalesce(p_status,'')));
BEGIN
  IF v_status NOT IN ('sent','failed') THEN
    RAISE EXCEPTION 'Invalid email notification result.';
  END IF;

  UPDATE public.order_email_notifications
     SET status = v_status,
         provider_message_id = CASE
           WHEN v_status='sent' THEN NULLIF(left(coalesce(p_provider_message_id,''),200),'')
           ELSE provider_message_id
         END,
         last_error = CASE
           WHEN v_status='failed' THEN left(coalesce(p_error,'Email provider rejected the message.'),500)
           ELSE NULL
         END,
         sent_at = CASE WHEN v_status='sent' THEN now() ELSE sent_at END,
         updated_at = now()
   WHERE order_id = p_order_id
   RETURNING * INTO STRICT v_notification;

  RETURN jsonb_build_object(
    'order_id',p_order_id,
    'status',v_notification.status,
    'attempts',v_notification.attempts,
    'sent_at',v_notification.sent_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_genmerch_order_confirmation_email(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_genmerch_order_confirmation_email(uuid,text,text,text)
  TO service_role;
