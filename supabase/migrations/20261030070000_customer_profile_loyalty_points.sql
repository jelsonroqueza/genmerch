begin;

alter table public.orders
  add column if not exists loyalty_points_redeemed integer not null default 0,
  add column if not exists loyalty_points_discount numeric(12,2) not null default 0;

create schema if not exists genmerch_private;

create table if not exists public.genmerch_loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('earn','redeem','expiry','refund_restore','earn_reversal','adjustment')),
  points_delta integer not null check (points_delta <> 0),
  reason text not null,
  expires_at timestamptz,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists genmerch_loyalty_ledger_user_created_idx
  on public.genmerch_loyalty_points_ledger (user_id, created_at desc);
create index if not exists genmerch_loyalty_ledger_order_type_idx
  on public.genmerch_loyalty_points_ledger (order_id, entry_type);

alter table public.genmerch_loyalty_points_ledger enable row level security;
drop policy if exists genmerch_loyalty_ledger_read_own on public.genmerch_loyalty_points_ledger;
create policy genmerch_loyalty_ledger_read_own
  on public.genmerch_loyalty_points_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.genmerch_loyalty_points_ledger from public, anon, authenticated;
grant select on table public.genmerch_loyalty_points_ledger to authenticated;

create table if not exists genmerch_private.genmerch_loyalty_points_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_id uuid not null unique references public.genmerch_loyalty_points_ledger(id) on delete cascade,
  origin_order_id uuid references public.orders(id) on delete set null,
  lot_type text not null check (lot_type in ('grant','debt')),
  remaining_points integer not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (lot_type = 'grant' and remaining_points >= 0 and expires_at is not null)
    or (lot_type = 'debt' and remaining_points <= 0 and expires_at is null)
  )
);

create index if not exists genmerch_loyalty_lots_user_expiry_idx
  on genmerch_private.genmerch_loyalty_points_lots (user_id, lot_type, expires_at, created_at);
alter table genmerch_private.genmerch_loyalty_points_lots enable row level security;
revoke all on table genmerch_private.genmerch_loyalty_points_lots from public, anon, authenticated;

create or replace function genmerch_private.reconcile_loyalty_points_lots(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_debt record;
  v_credit record;
  v_owed integer;
  v_take integer;
begin
  if p_user_id is null then return; end if;

  for v_debt in
    select l.id, l.remaining_points
      from genmerch_private.genmerch_loyalty_points_lots l
     where l.user_id = p_user_id
       and l.lot_type = 'debt'
       and l.remaining_points < 0
     order by l.created_at, l.id
     for update
  loop
    v_owed := -v_debt.remaining_points;

    for v_credit in
      select l.id, l.remaining_points
        from genmerch_private.genmerch_loyalty_points_lots l
       where l.user_id = p_user_id
         and l.lot_type = 'grant'
         and l.remaining_points > 0
       order by l.expires_at asc, l.created_at asc, l.id
       for update
    loop
      exit when v_owed <= 0;
      v_take := least(v_owed, v_credit.remaining_points);
      update genmerch_private.genmerch_loyalty_points_lots
         set remaining_points = remaining_points - v_take
       where id = v_credit.id;
      update genmerch_private.genmerch_loyalty_points_lots
         set remaining_points = remaining_points + v_take
       where id = v_debt.id;
      v_owed := v_owed - v_take;
    end loop;
  end loop;
end;
$function$;

create or replace function genmerch_private.expire_loyalty_points_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lot record;
  v_expired integer;
  v_now timestamptz := now();
begin
  if p_user_id is null then return; end if;

  perform genmerch_private.reconcile_loyalty_points_lots(p_user_id);

  for v_lot in
    select l.id, l.ledger_id, l.origin_order_id, l.remaining_points, l.expires_at
      from genmerch_private.genmerch_loyalty_points_lots l
     where l.user_id = p_user_id
       and l.lot_type = 'grant'
       and l.remaining_points > 0
       and l.expires_at <= v_now
     order by l.expires_at, l.created_at
     for update
  loop
    v_expired := v_lot.remaining_points;
    update genmerch_private.genmerch_loyalty_points_lots
       set remaining_points = 0
     where id = v_lot.id;

    insert into public.genmerch_loyalty_points_ledger
      (user_id, order_id, entry_type, points_delta, reason, expires_at, idempotency_key, metadata, created_at)
    values
      (p_user_id, v_lot.origin_order_id, 'expiry', -v_expired,
       'Unused loyalty points expired after 12 months.',
       v_lot.expires_at, 'expiry:' || v_lot.id::text,
       jsonb_build_object('source_lot_id', v_lot.id), v_now)
    on conflict (idempotency_key) do nothing;
  end loop;
end;
$function$;

create or replace function genmerch_private.process_loyalty_points_for_order()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := new.user_id;
  v_earn_ledger_id uuid;
  v_earn_lot_id uuid;
  v_reversal_ledger_id uuid;
  v_restore_ledger_id uuid;
  v_redeem record;
  v_earned integer;
  v_expired integer;
  v_remaining integer;
  v_reverse integer;
  v_debt integer;
  v_granted integer;
  v_expiry timestamptz;
begin
  if v_user_id is null then return new; end if;

  perform 1 from auth.users u where u.id = v_user_id for update;
  if not found then return new; end if;

  -- Award once only after both delivery completion and payment settlement.
  if new.status = 'delivered' and new.payment_status = 'paid' then
    v_granted := floor(greatest(0, coalesce(new.subtotal, 0) - coalesce(new.discount_amount, 0)) / 100)::integer;
    if v_granted > 0 then
      v_expiry := now() + interval '12 months';
      v_earn_ledger_id := null;
      insert into public.genmerch_loyalty_points_ledger
        (user_id, order_id, entry_type, points_delta, reason, expires_at, idempotency_key, metadata)
      values
        (v_user_id, new.id, 'earn', v_granted,
         'Earned 1 point per ₱100 of eligible merchandise spending on order ' || new.order_number || '.',
         v_expiry, 'earn:' || new.id::text,
         jsonb_build_object('eligible_merchandise_amount', greatest(0, coalesce(new.subtotal, 0) - coalesce(new.discount_amount, 0))))
      on conflict (idempotency_key) do nothing
      returning id into v_earn_ledger_id;

      if v_earn_ledger_id is not null then
        insert into genmerch_private.genmerch_loyalty_points_lots
          (user_id, ledger_id, origin_order_id, lot_type, remaining_points, expires_at)
        values (v_user_id, v_earn_ledger_id, new.id, 'grant', v_granted, v_expiry);
        perform genmerch_private.reconcile_loyalty_points_lots(v_user_id);
      end if;
    end if;
  end if;

  -- Reverse non-expired earned points and restore redeemed points after cancellation/refund.
  if (
    (new.status in ('cancelled','refunded') and old.status is distinct from new.status)
    or (new.payment_status in ('cancelled','refunded') and old.payment_status is distinct from new.payment_status)
  ) then
    v_earn_ledger_id := null;
    v_earned := 0;
    select l.id, l.points_delta
      into v_earn_ledger_id, v_earned
      from public.genmerch_loyalty_points_ledger l
     where l.idempotency_key = 'earn:' || new.id::text
       and l.entry_type = 'earn'
       and l.points_delta > 0
     limit 1;

    if v_earn_ledger_id is not null
       and not exists (
         select 1 from public.genmerch_loyalty_points_ledger l
          where l.idempotency_key = 'earn-reversal:' || v_earn_ledger_id::text
       ) then
      v_earn_lot_id := null;
      v_remaining := 0;
      select lot.id, lot.remaining_points
        into v_earn_lot_id, v_remaining
        from genmerch_private.genmerch_loyalty_points_lots lot
       where lot.ledger_id = v_earn_ledger_id
         and lot.lot_type = 'grant'
       limit 1
       for update;

      select coalesce(sum(-l.points_delta), 0)::integer
        into v_expired
        from public.genmerch_loyalty_points_ledger l
       where l.entry_type = 'expiry'
         and l.points_delta < 0
         and l.metadata ->> 'source_lot_id' = v_earn_lot_id::text;

      v_reverse := greatest(0, v_earned - coalesce(v_expired, 0));
      v_remaining := greatest(0, coalesce(v_remaining, 0));
      v_debt := greatest(0, v_reverse - v_remaining);

      if v_reverse > 0 then
        insert into public.genmerch_loyalty_points_ledger
          (user_id, order_id, entry_type, points_delta, reason, idempotency_key, metadata)
        values
          (v_user_id, new.id, 'earn_reversal', -v_reverse,
           'Reversed unexpired points from cancelled/refunded order ' || new.order_number || '.',
           'earn-reversal:' || v_earn_ledger_id::text,
           jsonb_build_object('source_ledger_id', v_earn_ledger_id, 'points_reversed', v_reverse))
        returning id into v_reversal_ledger_id;

        if v_earn_lot_id is not null then
          update genmerch_private.genmerch_loyalty_points_lots
             set remaining_points = 0
           where id = v_earn_lot_id;
        end if;

        if v_debt > 0 then
          insert into genmerch_private.genmerch_loyalty_points_lots
            (user_id, ledger_id, origin_order_id, lot_type, remaining_points, expires_at)
          values (v_user_id, v_reversal_ledger_id, new.id, 'debt', -v_debt, null);
        end if;

        perform genmerch_private.reconcile_loyalty_points_lots(v_user_id);
      end if;
    end if;

    for v_redeem in
      select l.id, l.points_delta
        from public.genmerch_loyalty_points_ledger l
       where l.user_id = v_user_id
         and l.order_id = new.id
         and l.entry_type = 'redeem'
         and l.points_delta < 0
    loop
      if not exists (
        select 1 from public.genmerch_loyalty_points_ledger r
         where r.idempotency_key = 'restore:' || v_redeem.id::text
      ) then
        v_restore_ledger_id := null;
        v_expiry := now() + interval '12 months';
        insert into public.genmerch_loyalty_points_ledger
          (user_id, order_id, entry_type, points_delta, reason, expires_at, idempotency_key, metadata)
        values
          (v_user_id, new.id, 'refund_restore', -v_redeem.points_delta,
           'Restored loyalty points used on cancelled/refunded order ' || new.order_number || '.',
           v_expiry, 'restore:' || v_redeem.id::text,
           jsonb_build_object('source_redemption_id', v_redeem.id))
        on conflict (idempotency_key) do nothing
        returning id into v_restore_ledger_id;

        if v_restore_ledger_id is not null then
          insert into genmerch_private.genmerch_loyalty_points_lots
            (user_id, ledger_id, origin_order_id, lot_type, remaining_points, expires_at)
          values (v_user_id, v_restore_ledger_id, new.id, 'grant', -v_redeem.points_delta, v_expiry);
          perform genmerch_private.reconcile_loyalty_points_lots(v_user_id);
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

drop trigger if exists genmerch_loyalty_points_order_status on public.orders;
create trigger genmerch_loyalty_points_order_status
  after update of status, payment_status on public.orders
  for each row execute function genmerch_private.process_loyalty_points_for_order();

create or replace function public.get_my_genmerch_loyalty_summary()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_earned bigint := 0;
  v_redeemed bigint := 0;
  v_history jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in to view your GENMERCH points.' using errcode = '28000';
  end if;

  perform 1 from auth.users u where u.id = v_user_id for update;
  perform genmerch_private.expire_loyalty_points_for_user(v_user_id);
  perform genmerch_private.reconcile_loyalty_points_lots(v_user_id);

  select greatest(0, coalesce(sum(l.remaining_points), 0))::integer
    into v_balance
    from genmerch_private.genmerch_loyalty_points_lots l
   where l.user_id = v_user_id;

  select
    coalesce(sum(case when l.entry_type in ('earn','refund_restore') and l.points_delta > 0 then l.points_delta else 0 end),0),
    coalesce(sum(case when l.entry_type = 'redeem' and l.points_delta < 0 then -l.points_delta else 0 end),0)
    into v_earned, v_redeemed
    from public.genmerch_loyalty_points_ledger l
   where l.user_id = v_user_id;

  select coalesce(jsonb_agg(entry order by (entry->>'created_at')::timestamptz desc), '[]'::jsonb)
    into v_history
    from (
      select jsonb_build_object(
        'entry_type', l.entry_type,
        'points_delta', l.points_delta,
        'reason', l.reason,
        'created_at', l.created_at,
        'expires_at', l.expires_at,
        'order_id', l.order_id
      ) as entry
        from public.genmerch_loyalty_points_ledger l
       where l.user_id = v_user_id
       order by l.created_at desc
       limit 50
    ) history_rows;

  return jsonb_build_object(
    'points_balance', v_balance,
    'lifetime_earned', v_earned,
    'lifetime_redeemed', v_redeemed,
    'history', v_history
  );
end;
$function$;

-- A dedicated authenticated checkout overload applies redemption atomically in the
-- same transaction that creates the order. The existing no-points signatures remain
-- intact for compatibility with already-open pages and other safe server callers.
create or replace function public.create_genmerch_order(
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
  p_items jsonb,
  p_loyalty_points_to_redeem integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_receipt_email text := lower(btrim(coalesce(p_receipt_email, '')));
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_order_user_id uuid;
  v_existing_receipt_email text;
  v_subtotal numeric;
  v_total numeric;
  v_discount numeric;
  v_balance integer := 0;
  v_available_to_consume integer;
  v_take integer;
  v_requested integer := p_loyalty_points_to_redeem;
  v_existing_redeemed integer := 0;
  v_replayed boolean := false;
  v_lot record;
  v_remaining integer;
begin
  if v_user_id is null then
    raise exception 'Please sign in or create a GENMERCH customer account before placing an order.' using errcode = '28000';
  end if;
  if v_requested is null or v_requested < 0 then
    raise exception 'The loyalty points amount is invalid.';
  end if;
  if length(v_receipt_email) > 254
     or v_receipt_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'Enter a valid email address for your order confirmation.';
  end if;

  -- Serialize loyalty actions for this customer.
  perform 1 from auth.users u where u.id = v_user_id for update;
  perform genmerch_private.expire_loyalty_points_for_user(v_user_id);
  perform genmerch_private.reconcile_loyalty_points_lots(v_user_id);

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
  v_order_number := v_result->>'order_number';
  v_replayed := coalesce((v_result->>'replayed')::boolean, false);
  if v_order_id is null then
    raise exception 'Order creation did not return an order ID.';
  end if;

  select o.user_id, lower(o.receipt_email), o.subtotal, o.total_amount,
         o.discount_amount, o.loyalty_points_redeemed
    into v_order_user_id, v_existing_receipt_email, v_subtotal, v_total, v_discount, v_existing_redeemed
    from public.orders o
   where o.id = v_order_id
   for update;

  if v_order_user_id is distinct from v_user_id then
    raise exception 'This checkout reference is not linked to your signed-in account.';
  end if;

  if v_existing_receipt_email is not null and v_existing_receipt_email is distinct from v_receipt_email then
    raise exception 'This checkout reference already has a different order email. Start a fresh checkout to change it.';
  end if;
  if v_existing_receipt_email is null then
    update public.orders set receipt_email = v_receipt_email where id = v_order_id;
  end if;

  select coalesce(-sum(l.points_delta), 0)::integer
    into v_existing_redeemed
    from public.genmerch_loyalty_points_ledger l
   where l.order_id = v_order_id and l.entry_type = 'redeem' and l.points_delta < 0;

  if v_replayed then
    if v_existing_redeemed <> v_requested then
      raise exception 'This checkout reference was already used with a different loyalty points selection. Return to checkout and start a fresh request.';
    end if;
    return v_result || jsonb_build_object(
      'points_redeemed', v_existing_redeemed,
      'loyalty_discount', v_existing_redeemed,
      'discount_amount', v_discount,
      'total_amount', v_total
    );
  end if;

  if v_requested > 0 then
    if v_requested < 20 then
      raise exception 'Use at least 20 GENMERCH points per redemption.';
    end if;

    select coalesce(sum(l.remaining_points), 0)::integer
      into v_balance
      from genmerch_private.genmerch_loyalty_points_lots l
     where l.user_id = v_user_id;

    if v_requested > greatest(0, v_balance) then
      raise exception 'Your GENMERCH points balance changed. Refresh your account and try again.';
    end if;

    if v_requested > floor(greatest(0, coalesce(v_subtotal, 0)) * 0.20)::integer then
      raise exception 'You can redeem points for up to 20%% of the eligible merchandise subtotal. Reduce the points amount and try again.';
    end if;

    v_available_to_consume := v_requested;
    for v_lot in
      select l.id, l.remaining_points
        from genmerch_private.genmerch_loyalty_points_lots l
       where l.user_id = v_user_id
         and l.lot_type = 'grant'
         and l.remaining_points > 0
         and l.expires_at > now()
       order by l.expires_at asc, l.created_at asc, l.id
       for update
    loop
      exit when v_available_to_consume <= 0;
      v_take := least(v_available_to_consume, v_lot.remaining_points);
      update genmerch_private.genmerch_loyalty_points_lots
         set remaining_points = remaining_points - v_take
       where id = v_lot.id;
      v_available_to_consume := v_available_to_consume - v_take;
    end loop;

    if v_available_to_consume > 0 then
      raise exception 'Your points are not available for redemption anymore. Refresh and try again.';
    end if;

    insert into public.genmerch_loyalty_points_ledger
      (user_id, order_id, entry_type, points_delta, reason, idempotency_key, metadata)
    values
      (v_user_id, v_order_id, 'redeem', -v_requested,
       'Redeemed ' || v_requested || ' GENMERCH points at checkout for order ' || v_order_number || '.',
       'redeem:' || v_order_id::text,
       jsonb_build_object('points_redeemed', v_requested, 'discount_php', v_requested));

    update public.orders
       set discount_amount = coalesce(discount_amount, 0) + v_requested,
           total_amount = greatest(0, coalesce(total_amount, 0) - v_requested),
           loyalty_points_redeemed = v_requested,
           loyalty_points_discount = v_requested,
           updated_at = now()
     where id = v_order_id;

    select o.total_amount, o.discount_amount
      into v_total, v_discount
      from public.orders o
     where o.id = v_order_id;
  else
    update public.orders
       set loyalty_points_redeemed = 0,
           loyalty_points_discount = 0
     where id = v_order_id;
  end if;

  return v_result || jsonb_build_object(
    'points_redeemed', v_requested,
    'loyalty_discount', v_requested,
    'discount_amount', coalesce(v_discount, 0),
    'total_amount', coalesce(v_total, (v_result->>'total_amount')::numeric)
  );
end;
$function$;

revoke all on function genmerch_private.reconcile_loyalty_points_lots(uuid) from public, anon, authenticated;
revoke all on function genmerch_private.expire_loyalty_points_for_user(uuid) from public, anon, authenticated;
revoke all on function genmerch_private.process_loyalty_points_for_order() from public, anon, authenticated;
revoke all on function public.get_my_genmerch_loyalty_summary() from public, anon, authenticated;
grant execute on function public.get_my_genmerch_loyalty_summary() to authenticated;

revoke all on function public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.create_genmerch_order(uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,integer) to authenticated;

commit;