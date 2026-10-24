
-- GENMERCH Seller Centre product gallery uploads.
-- The existing bucket is public, capped at 2 MiB, and restricted to JPEG/PNG/WebP.
UPDATE storage.buckets
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
WHERE id = 'product-images';

CREATE POLICY genmerch_admin_list_product_images_storage
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'products'
  AND public.is_genmerch_admin()
);

CREATE POLICY genmerch_admin_upload_product_images_storage
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'products'
  AND public.is_genmerch_admin()
);

CREATE POLICY genmerch_admin_update_product_images_storage
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'products'
  AND public.is_genmerch_admin()
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'products'
  AND public.is_genmerch_admin()
);

CREATE POLICY genmerch_admin_delete_product_images_storage
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'products'
  AND public.is_genmerch_admin()
);
