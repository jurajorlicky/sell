-- Instructions for creating the 'contracts' storage bucket
-- This bucket stores PDF purchase agreement contracts

-- IMPORTANT: This SQL script contains instructions only.
-- The bucket must be created manually in the Supabase Dashboard.

-- ============================================
-- STEP 1: Create Storage Bucket in Dashboard
-- ============================================
-- 1. Go to Supabase Dashboard
-- 2. Navigate to Storage
-- 3. Click "Create Bucket"
-- 4. Configure:
--    - Name: "contracts"
--    - Public bucket: Yes (recommended) OR No (with RLS policies)
--    - File size limit: 5MB
--    - Allowed MIME types: application/pdf

-- ============================================
-- STEP 2: RLS Policies (if bucket is NOT public)
-- ============================================
-- If you set the bucket as NOT public, run the following policies:

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can upload contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all contracts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete contracts" ON storage.objects;

-- Allow admins to upload contracts
CREATE POLICY "Admins can upload contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
);

-- Allow admins to read all contracts
CREATE POLICY "Admins can read all contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
);

-- Allow users to read their own contracts
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

-- Allow admins to delete contracts
CREATE POLICY "Admins can delete contracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contracts' AND
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
);

-- ============================================
-- STEP 3: Verify Policies
-- ============================================
-- Run this query to verify policies were created:
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%contracts%';

