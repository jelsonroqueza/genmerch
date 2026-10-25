-- Add indexes for foreign-key columns flagged by Supabase Performance Advisor.
-- These indexes improve joins/deletes without changing application behavior.
create index if not exists cart_items_variant_id_idx
  on public.cart_items (variant_id);
create index if not exists customer_wishlist_product_id_idx
  on public.customer_wishlist (product_id);
create index if not exists inventory_movements_actor_id_idx
  on public.inventory_movements (actor_id);
create index if not exists order_items_product_id_idx
  on public.order_items (product_id);
create index if not exists order_items_variant_id_idx
  on public.order_items (variant_id);
create index if not exists order_status_history_actor_user_id_idx
  on public.order_status_history (actor_user_id);
create index if not exists product_reviews_order_id_idx
  on public.product_reviews (order_id);
