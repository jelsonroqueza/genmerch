-- Persist the chosen receipt recipient and protect email confirmation sends against replay.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS receipt_email text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_receipt_email_format_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_receipt_email_format_check
  CHECK (
    receipt_email IS NULL OR
    receipt_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  );

CREATE TABLE IF NOT EXISTS public.order_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
ALTER TABLE public.order_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_email_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.order_email_notifications TO service_role;

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
     AND o.created_at>=now()-interval '48 hours'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order details could not be verified. Check the order number and checkout mobile number.'; END IF;

  UPDATE public.orders SET receipt_email=v_email WHERE id=p_order_id;
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
REVOKE ALL ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_genmerch_order_confirmation_email(uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_genmerch_order_confirmation_email(
  p_order_id uuid,p_status text,p_provider_message_id text DEFAULT NULL,p_error text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_notification public.order_email_notifications%ROWTYPE;
  v_role text := current_setting('request.jwt.claim.role',true);
  v_status text := lower(btrim(coalesce(p_status,'')));
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role access required.' USING ERRCODE='42501'; END IF;
  IF v_status NOT IN ('sent','failed') THEN RAISE EXCEPTION 'Invalid email notification result.'; END IF;
  UPDATE public.order_email_notifications
     SET status=v_status,
         provider_message_id=CASE WHEN v_status='sent' THEN NULLIF(left(coalesce(p_provider_message_id,''),200),'') ELSE provider_message_id END,
         last_error=CASE WHEN v_status='failed' THEN left(coalesce(p_error,'Email provider rejected the message.'),500) ELSE NULL END,
         sent_at=CASE WHEN v_status='sent' THEN now() ELSE sent_at END,
         updated_at=now()
   WHERE order_id=p_order_id
   RETURNING * INTO STRICT v_notification;
  RETURN jsonb_build_object('order_id',p_order_id,'status',v_notification.status,'attempts',v_notification.attempts,'sent_at',v_notification.sent_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.finish_genmerch_order_confirmation_email(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_genmerch_order_confirmation_email(uuid,text,text,text) TO service_role;
