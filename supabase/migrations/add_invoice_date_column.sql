-- Add invoice_date column to user_sales table
-- This allows storing invoice date separately from created_at
-- This simplifies the dual sale system - we only need one sale record

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN invoice_date timestamptz;
    
    -- For existing sales, set invoice_date to created_at if it exists
    UPDATE user_sales SET invoice_date = created_at WHERE invoice_date IS NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_sales_invoice_date ON user_sales(invoice_date);

