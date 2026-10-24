-- Track shipment notification emails independently from checkout confirmations.
CREATE TABLE IF NOT EXISTS public.shipment_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  courier_name text NOT NULL,
  tracking_number text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.shipment_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shipment_email_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.shipment_email_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_genmerch_shipment_email(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_shipment public.shipments%ROWTYPE;
  v_notification public.shipment_email_notifications%ROWTYPE;
  v_email text;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'Order ID is required.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text, 1));

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.status NOT IN ('shipped','out_for_delivery','delivered') THEN
    RAISE EXCEPTION 'Shipment email is available only after the order has shipped.';
  END IF;

  SELECT s.* INTO v_shipment
    FROM public.shipments s
   WHERE s.order_id = p_order_id
   FOR UPDATE;

  IF NOT FOUND OR NULLIF(btrim(coalesce(v_shipment.courier_name,'')),'') IS NULL
     OR NULLIF(btrim(coalesce(v_shipment.tracking_number,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Courier and delivery reference must be saved before emailing the customer.';
  END IF;

  v_email := lower(btrim(coalesce(v_order.receipt_email, v_order.customer_email, '')));
  IF length(v_email)>254 OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
    RAISE EXCEPTION 'The order has no valid recipient email address.';
  END IF;

  SELECT n.* INTO v_notification
    FROM public.shipment_email_notifications n
   WHERE n.order_id = p_order_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_notification.status='sent'
       AND lower(v_notification.recipient_email)=v_email
       AND v_notification.courier_name=v_shipment.courier_name
       AND v_notification.tracking_number=v_shipment.tracking_number THEN
      RETURN jsonb_build_object(
        'status','sent','already_sent',true,'order_id',p_order_id,
        'recipient_email',v_email,'courier_name',v_shipment.courier_name,
        'tracking_number',v_shipment.tracking_number,
        'provider_message_id',v_notification.provider_message_id
      );
    END IF;

    IF v_notification.status='sending' THEN
      RETURN jsonb_build_object(
        'status','sending','already_sending',true,'order_id',p_order_id,
        'recipient_email',v_email,'courier_name',v_shipment.courier_name,
        'tracking_number',v_shipment.tracking_number
      );
    END IF;

    IF v_notification.attempts>=3 THEN
      RAISE EXCEPTION 'The shipment email retry limit for this order has been reached.';
    END IF;

    UPDATE public.shipment_email_notifications
       SET recipient_email=v_email,
           courier_name=v_shipment.courier_name,
           tracking_number=v_shipment.tracking_number,
           status='sending',
           attempts=attempts+1,
           last_error=NULL,
           updated_at=now()
     WHERE order_id=p_order_id
     RETURNING * INTO v_notification;
  ELSE
    INSERT INTO public.shipment_email_notifications(
      order_id,recipient_email,courier_name,tracking_number,status,attempts
    ) VALUES (
      p_order_id,v_email,v_shipment.courier_name,v_shipment.tracking_number,'sending',1
    ) RETURNING * INTO v_notification;
  END IF;

  RETURN jsonb_build_object(
    'status','sending','already_sending',false,'order_id',p_order_id,
    'recipient_email',v_email,'courier_name',v_shipment.courier_name,
    'tracking_number',v_shipment.tracking_number,'attempts',v_notification.attempts
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_genmerch_shipment_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_genmerch_shipment_email(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_genmerch_shipment_email(
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
  v_notification public.shipment_email_notifications%ROWTYPE;
  v_status text := lower(btrim(coalesce(p_status,'')));
BEGIN
  IF v_status NOT IN ('sent','failed') THEN
    RAISE EXCEPTION 'Invalid shipment email notification result.';
  END IF;

  UPDATE public.shipment_email_notifications
     SET status=v_status,
         provider_message_id=CASE
           WHEN v_status='sent' THEN NULLIF(left(coalesce(p_provider_message_id,''),200),'')
           ELSE provider_message_id
         END,
         last_error=CASE
           WHEN v_status='failed' THEN left(coalesce(p_error,'Email provider rejected the message.'),500)
           ELSE NULL
         END,
         sent_at=CASE WHEN v_status='sent' THEN now() ELSE sent_at END,
         updated_at=now()
   WHERE order_id=p_order_id
   RETURNING * INTO STRICT v_notification;

  RETURN jsonb_build_object(
    'order_id',p_order_id,'status',v_notification.status,
    'attempts',v_notification.attempts,'sent_at',v_notification.sent_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_genmerch_shipment_email(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_genmerch_shipment_email(uuid,text,text,text) TO service_role;
