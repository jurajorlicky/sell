-- Migration: Add contract_url column to user_sales table
-- This allows storing PDF purchase agreement contracts for each sale

-- Add contract_url column
ALTER TABLE user_sales 
ADD COLUMN IF NOT EXISTS contract_url TEXT;

-- Add comment
COMMENT ON COLUMN user_sales.contract_url IS 'URL to generated PDF purchase agreement contract in Supabase Storage';

-- Note: You need to create a 'contracts' storage bucket in Supabase Dashboard:
-- 1. Go to Storage
-- 2. Create new bucket named 'contracts'
-- 3. Set it as public (recommended) or configure RLS policies
-- 4. Set file size limit to 5MB
-- 5. Set allowed MIME types to: application/pdf

