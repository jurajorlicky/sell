-- Migration: Add is_manual column to user_sales table
-- This marks sales that were manually created by admin

-- Add is_manual column
ALTER TABLE user_sales 
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN user_sales.is_manual IS 'Indicates if the sale was manually created by admin (true) or created from user product listing (false)';

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_user_sales_is_manual ON user_sales(is_manual);

