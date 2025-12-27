-- Storage Policies for 'contracts' bucket
-- Run this if upload fails with "new row violates row-level security policy"
-- This fixes the 403 Unauthorized error when uploading PDF contracts

-- Note: These policies are for storage.objects table
-- Make sure you're running this in Supabase SQL Editor

-- First, drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all contracts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update contracts" ON storage.objects;

-- Policy 1: Allow authenticated admins to upload (INSERT) to contracts bucket
-- This is the most important policy - it allows admins to upload PDF contracts
CREATE POLICY "Admins can upload contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Policy 2: Allow authenticated admins to read (SELECT) all contracts
CREATE POLICY "Admins can read all contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Policy 3: Allow users to read their own contracts
CREATE POLICY "Users can read own contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM user_sales WHERE user_id = auth.uid()
  )
);

-- Policy 4: Allow admins to delete contracts
CREATE POLICY "Admins can delete contracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Policy 5: Allow admins to update contracts (needed for upsert)
CREATE POLICY "Admins can update contracts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
)
WITH CHECK (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Verify policies were created:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%contracts%';

