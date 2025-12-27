-- Migration: Create storage bucket for labels and set up RLS policies
-- This migration creates the 'labels' bucket for PDF label uploads

-- Note: Bucket creation must be done via Supabase Dashboard or API
-- Go to: Supabase Dashboard > Storage > Create Bucket
-- Bucket name: 'labels'
-- Public: true (recommended for easier access)
-- File size limit: 10MB
-- Allowed MIME types: application/pdf

-- If bucket is not public, use these RLS policies:

-- Policy 1: Allow authenticated users to upload labels
-- (Run this in Supabase Dashboard > Storage > labels bucket > Policies)

-- INSERT Policy:
-- Name: "Admins can upload labels"
-- Target roles: authenticated
-- USING expression: EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
-- WITH CHECK expression: EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())

-- Policy 2: Allow authenticated users to read labels
-- SELECT Policy:
-- Name: "Authenticated users can read labels"
-- Target roles: authenticated
-- USING expression: true

-- Policy 3: Allow admins to delete labels
-- DELETE Policy:
-- Name: "Admins can delete labels"
-- Target roles: authenticated
-- USING expression: EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())

-- Alternative: If you want to use SQL to create policies (requires service_role key):
-- Note: These commands need to be run with service_role permissions

-- Example using Supabase Management API or service_role:
/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'labels',
  'labels',
  true,
  10485760, -- 10MB in bytes
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
*/

-- For RLS policies on storage.objects (if bucket is not public):
/*
CREATE POLICY "Admins can upload labels"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'labels' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

CREATE POLICY "Authenticated users can read labels"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'labels');

CREATE POLICY "Admins can delete labels"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'labels' AND
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);
*/


