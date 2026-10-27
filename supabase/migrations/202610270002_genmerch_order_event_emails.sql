create table public.genmerch_order_event_email_notifications (
  order_id uuid not null references public.orders(id) on delete cascade,
  email_type text not null check (email_type in ('refund','delivery_survey')),
  recipient_email text not null check (char_length(recipient_email) <= 254),
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 3),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (order_id,email_type)
);

alter table public.genmerch_order_event_email_notifications enable row level security;
revoke all on table public.genmerch_order_event_email_notifications from public, anon, authenticated;
grant all on table public.genmerch_order_event_email_notifications to service_role;

create or replace function public.reserve_genmerch_order_event_email(p_order_id uuid, p_email_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_notification public.genmerch_order_event_email_notifications%rowtype;
  v_type text := lower(btrim(coalesce(p_email_type,'')));
  v_email text;
begin
  if p_order_id is null then raise exception 'Order ID is required.'; end if;
  if v_type not in ('refund','delivery_survey') then raise exception 'Unsupported order email type.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text || ':' || v_type, 0));
  select o.* into v_order from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  if v_type='refund' then
    if lower(coalesce(v_order.status,'')) <> 'refunded'
       and lower(coalesce(v_order.payment_status,'')) <> 'refunded' then
      raise exception 'A refund email can only be sent after the order or payment is marked refunded.';
    end if;
  else
    if lower(coalesce(v_order.status,'')) <> 'delivered'
       or lower(coalesce(v_order.payment_status,'')) <> 'paid' then
      raise exception 'A delivery survey can only be sent after delivery is confirmed and payment is marked paid.';
    end if;
  end if;

  v_email := lower(btrim(coalesce(v_order.receipt_email,v_order.customer_email,'')));
  if length(v_email)>254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'The order has no valid customer email address.';
  end if;

  select n.* into v_notification
    from public.genmerch_order_event_email_notifications n
   where n.order_id=p_order_id and n.email_type=v_type
   for update;
  if found then
    if v_notification.status='sent' then
      return jsonb_build_object('status','sent','already_sent',true,'recipient_email',v_notification.recipient_email,'provider_message_id',v_notification.provider_message_id);
    end if;
    if v_notification.status='sending' and v_notification.updated_at > now()-interval '5 minutes' then
      return jsonb_build_object('status','sending','already_sending',true,'recipient_email',v_notification.recipient_email);
    end if;
    if v_notification.attempts>=3 then raise exception 'The retry limit for this order email has been reached.'; end if;
    update public.genmerch_order_event_email_notifications
       set recipient_email=v_email,status='sending',attempts=attempts+1,last_error=null,updated_at=now()
     where order_id=p_order_id and email_type=v_type returning * into v_notification;
  else
    insert into public.genmerch_order_event_email_notifications(order_id,email_type,recipient_email,status,attempts)
    values(p_order_id,v_type,v_email,'sending',1)
    returning * into v_notification;
  end if;

  return jsonb_build_object('status','sending','already_sending',false,'recipient_email',v_email,'attempts',v_notification.attempts);
end;
$function$;

create or replace function public.finish_genmerch_order_event_email(
  p_order_id uuid, p_email_type text, p_status text, p_provider_message_id text default null, p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type text := lower(btrim(coalesce(p_email_type,'')));
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_notification public.genmerch_order_event_email_notifications%rowtype;
begin
  if v_type not in ('refund','delivery_survey') then raise exception 'Unsupported order email type.'; end if;
  if v_status not in ('sent','failed') then raise exception 'Invalid order email notification result.'; end if;
  update public.genmerch_order_event_email_notifications
     set status=v_status,
         provider_message_id=case when v_status='sent' then nullif(left(coalesce(p_provider_message_id,''),200),'') else provider_message_id end,
         last_error=case when v_status='failed' then left(coalesce(p_error,'Email provider rejected the message.'),500) else null end,
         sent_at=case when v_status='sent' then now() else sent_at end,
         updated_at=now()
   where order_id=p_order_id and email_type=v_type
   returning * into strict v_notification;
  return jsonb_build_object('order_id',p_order_id,'email_type',v_type,'status',v_notification.status,'attempts',v_notification.attempts,'sent_at',v_notification.sent_at);
end;
$function$;

revoke all on function public.reserve_genmerch_order_event_email(uuid,text) from public, anon, authenticated;
revoke all on function public.finish_genmerch_order_event_email(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_genmerch_order_event_email(uuid,text) to service_role;
grant execute on function public.finish_genmerch_order_event_email(uuid,text,text,text,text) to service_role;
