-- Invoice PDFs contain financial and personal data. Keep the bucket private and
-- expose documents to authenticated admins through short-lived signed URLs.
UPDATE storage.buckets
SET public = false
WHERE id = 'invoices';

DROP POLICY IF EXISTS "Public can read invoices" ON storage.objects;

DROP POLICY IF EXISTS "Admins can read all invoices" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own invoices" ON storage.objects;
CREATE POLICY "Admins can read all invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE admin_users.id = auth.uid()
  )
);

CREATE POLICY "Users can read own invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1
    FROM public.invoice_documents
    JOIN public.user_sales
      ON user_sales.id = invoice_documents.user_sale_id
    WHERE invoice_documents.storage_path = storage.objects.name
      AND user_sales.user_id = auth.uid()
  )
);

COMMENT ON COLUMN public.invoice_documents.public_url IS
  'Stable invoice:// storage reference. The admin app creates a short-lived signed URL when needed.';

ALTER TABLE public.invoice_documents
ADD COLUMN IF NOT EXISTS content_sha256 text;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_documents_content_sha256_unique
ON public.invoice_documents(content_sha256)
WHERE content_sha256 IS NOT NULL;
