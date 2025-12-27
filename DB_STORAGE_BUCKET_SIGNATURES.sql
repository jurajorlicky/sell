/*
  # Create signatures storage bucket and RLS policies

  INSTRUCTIONS:
  1. Go to Supabase Dashboard > Storage
  2. Click "New bucket"
  3. Name: "signatures"
  4. Public: Yes (or No if you want to use RLS policies)
  5. File size limit: 2MB
  6. Allowed MIME types: image/png, image/jpeg, image/jpg, image/gif, image/webp

  Then run the RLS policies below.
*/

-- RLS Policies for signatures bucket
-- Note: These policies assume the bucket is NOT public

-- Allow authenticated users to upload their own signatures
DROP POLICY IF EXISTS "Users can upload their own signatures" ON storage.objects;
CREATE POLICY "Users can upload their own signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'signatures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own signatures
DROP POLICY IF EXISTS "Users can read their own signatures" ON storage.objects;
CREATE POLICY "Users can read their own signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own signatures
DROP POLICY IF EXISTS "Users can delete their own signatures" ON storage.objects;
CREATE POLICY "Users can delete their own signatures"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'signatures' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow admins to read all signatures
DROP POLICY IF EXISTS "Admins can read all signatures" ON storage.objects;
CREATE POLICY "Admins can read all signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures' AND
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
  )
);

-- Verify policies
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%signatures%';

