-- GENMERCH: Store the customer-facing color represented by each gallery image.
-- Product variants remain the source of truth for color/size stock and order items.
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS color_label text;

COMMENT ON COLUMN public.product_images.color_label IS
  'Customer-facing color label represented by this product gallery image; maps storefront color choices to color/size inventory variants.';
