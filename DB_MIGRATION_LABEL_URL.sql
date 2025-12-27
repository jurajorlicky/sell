-- Migration: Add label_url column to user_sales table
-- This migration adds support for PDF label uploads

-- Add label_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'label_url'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN label_url text;
    COMMENT ON COLUMN user_sales.label_url IS 'URL to uploaded PDF label file in Supabase Storage';
  END IF;
END $$;

-- Create storage bucket for labels if it doesn't exist
-- Note: This needs to be run in Supabase Dashboard > Storage > Create Bucket
-- Bucket name: 'labels'
-- Public: true (or false with RLS policies)
-- File size limit: 10MB
-- Allowed MIME types: application/pdf

-- RLS Policy for labels bucket (if bucket is not public)
-- Allow authenticated users to upload labels
-- Allow users to read their own labels
-- Allow admins to read all labels


