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
  v_window_start timestamptz := now() - interval '12 months';
  v_qualifying_spend numeric(12,2) := 0;
  v_membership_level text := 'bronze';
  v_next_membership_level text := 'silver';
  v_next_level_requirement numeric(12,2) := 5000;
  v_remaining_spend numeric(12,2) := 5000;
  v_progress_percentage numeric(5,2) := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in to view your GENMERCH points and membership.' using errcode = '28000';
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

  -- Count only orders that are both delivered and paid.
  -- discount_amount already includes promotion discounts and redeemed-points discounts.
  -- subtotal excludes shipping, so shipping fees never contribute to tier qualification.
  -- Use the delivery-completion history timestamp for the rolling 12-month window.
  select coalesce(
           sum(greatest(
             0::numeric,
             coalesce(o.subtotal, 0) - coalesce(o.discount_amount, 0)
           )),
           0
         )::numeric(12,2)
    into v_qualifying_spend
    from public.orders o
   where o.user_id = v_user_id
     and o.status = 'delivered'
     and o.payment_status = 'paid'
     and coalesce(
       (
         select min(h.created_at)
           from public.order_status_history h
          where h.order_id = o.id
            and h.to_status = 'delivered'
       ),
       o.updated_at,
       o.created_at
     ) >= v_window_start;

  if v_qualifying_spend >= 30000 then
    v_membership_level := 'platinum';
    v_next_membership_level := null;
    v_next_level_requirement := null;
    v_remaining_spend := 0;
    v_progress_percentage := 100;
  elsif v_qualifying_spend >= 15000 then
    v_membership_level := 'gold';
    v_next_membership_level := 'platinum';
    v_next_level_requirement := 30000;
  elsif v_qualifying_spend >= 5000 then
    v_membership_level := 'silver';
    v_next_membership_level := 'gold';
    v_next_level_requirement := 15000;
  else
    v_membership_level := 'bronze';
    v_next_membership_level := 'silver';
    v_next_level_requirement := 5000;
  end if;

  if v_next_level_requirement is not null then
    v_remaining_spend := greatest(0, v_next_level_requirement - v_qualifying_spend);
    v_progress_percentage := least(
      100,
      greatest(0, round((v_qualifying_spend / v_next_level_requirement) * 100, 2))
    );
  end if;

  return jsonb_build_object(
    'points_balance', v_balance,
    'lifetime_earned', v_earned,
    'lifetime_redeemed', v_redeemed,
    'history', v_history,
    'membership_level', v_membership_level,
    'qualifying_spend', v_qualifying_spend,
    'membership_window_start', v_window_start,
    'next_membership_level', v_next_membership_level,
    'next_level_requirement', v_next_level_requirement,
    'remaining_spend', v_remaining_spend,
    'progress_percentage', v_progress_percentage
  );
end;
$function$;

revoke all on function public.get_my_genmerch_loyalty_summary() from public, anon, authenticated;
grant execute on function public.get_my_genmerch_loyalty_summary() to authenticated;

comment on function public.get_my_genmerch_loyalty_summary() is
  'Returns the signed-in customer loyalty-points summary and GENMERCH membership tier. Tier spend counts paid and delivered merchandise orders within a rolling 12-month window, net of all order discounts and excluding shipping.';
