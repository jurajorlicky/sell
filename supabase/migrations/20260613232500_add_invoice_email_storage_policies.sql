-- Storage setup for invoice email imports.
-- The Netlify function uploads invoice PDFs to:
--   invoices/matched
--   invoices/unmatched

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, 52428800),
  allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "Admins can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all invoices" ON storage.objects;
DROP POLICY IF EXISTS "Public can read invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete invoices" ON storage.objects;

CREATE POLICY "Admins can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can read all invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Public can read invoices"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'invoices');

CREATE POLICY "Admins can update invoices"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can delete invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE id = auth.uid()
  )
);
