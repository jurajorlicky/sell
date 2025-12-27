-- Storage Policies for 'labels' bucket
-- Run this if upload fails with "new row violates row-level security policy"
-- This fixes the 403 Unauthorized error when uploading PDFs

-- Note: These policies are for storage.objects table
-- Make sure you're running this in Supabase SQL Editor

-- First, drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can upload labels" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read labels" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete labels" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update labels" ON storage.objects;

-- Policy 1: Allow authenticated admins to upload (INSERT) to labels bucket
-- This is the most important policy - it allows admins to upload PDF labels
CREATE POLICY "Admins can upload labels"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'labels' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Policy 2: Allow authenticated users to read (SELECT) from labels bucket
-- This allows users to view/download their labels
CREATE POLICY "Authenticated users can read labels"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'labels');

-- Policy 3: Allow admins to delete labels
CREATE POLICY "Admins can delete labels"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'labels' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Policy 4: Allow admins to update labels (if needed)
CREATE POLICY "Admins can update labels"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'labels' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
)
WITH CHECK (
  bucket_id = 'labels' AND
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
  AND policyname LIKE '%labels%'
ORDER BY policyname;

-- If you get errors, make sure:
-- 1. You're running this in Supabase SQL Editor (not in a migration)
-- 2. Your user has proper permissions
-- 3. The storage.objects table exists and RLS is enabled

-- To verify RLS is enabled on storage.objects:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects';

