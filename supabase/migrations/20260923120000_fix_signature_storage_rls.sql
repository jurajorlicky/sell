-- Provision signature storage and allow users to manage files only in their own folder.
-- Admins need access to edit signatures from the Users page.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own signatures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all signatures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all signatures" ON storage.objects;

CREATE POLICY "Users can upload their own signatures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own signatures"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read their own signatures"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own signatures"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'signatures'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can manage all signatures"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'signatures'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid())
)
WITH CHECK (
  bucket_id = 'signatures'
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid())
);
