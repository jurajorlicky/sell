-- Add sale_type column to user_sales table
-- This allows distinguishing between invoice sales and operational sales

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'sale_type'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN sale_type text DEFAULT 'operational' CHECK (sale_type IN ('operational', 'invoice'));
    
    -- Set all existing sales to 'operational' by default
    UPDATE user_sales SET sale_type = 'operational' WHERE sale_type IS NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_sales_sale_type ON user_sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_user_sales_user_id_sale_type ON user_sales(user_id, sale_type);


