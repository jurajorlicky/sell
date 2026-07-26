-- Add fa_url column to user_sales table
-- This allows admins to upload invoice (faktura/FA) PDF files for individual sales
-- Users can then download their FA directly from the sales view

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'fa_url'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN fa_url text;
  END IF;
END $$;

-- Add index for better query performance when filtering sales with FA
CREATE INDEX IF NOT EXISTS idx_user_sales_fa_url ON user_sales(fa_url) WHERE fa_url IS NOT NULL;
