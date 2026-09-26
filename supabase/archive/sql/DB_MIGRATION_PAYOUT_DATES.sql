/*
  # Add payout date tracking to user_sales table

  1. Changes to user_sales table
    - Add delivered_at column (date when order was delivered)
    - Add payout_date column (date when payout will be made - 14 days after delivery)
    - Add function to automatically calculate payout_date when delivered_at is set
    - Add trigger to automatically set payout_date when status changes to 'delivered'

  2. Security
    - Ensure RLS policies allow reading these fields
*/

-- Add delivered_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;

-- Add payout_date column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'payout_date'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN payout_date timestamptz;
  END IF;
END $$;

-- Function to calculate payout_date (14 days after delivered_at)
CREATE OR REPLACE FUNCTION calculate_payout_date(delivered_date timestamptz)
RETURNS timestamptz AS $$
BEGIN
  IF delivered_date IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN delivered_date + INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to automatically set payout_date when delivered_at changes
CREATE OR REPLACE FUNCTION set_payout_date_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is 'delivered' and delivered_at is set, calculate payout_date
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NOT NULL THEN
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
  END IF;
  
  -- If delivered_at is updated, recalculate payout_date
  IF NEW.delivered_at IS NOT NULL AND (OLD.delivered_at IS NULL OR NEW.delivered_at != OLD.delivered_at) THEN
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
  END IF;
  
  -- If status changes to 'delivered' and delivered_at is not set, set it to now
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at = NOW();
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
  END IF;
  
  -- If status changes from 'delivered' to something else, clear delivered_at and payout_date
  IF OLD.status = 'delivered' AND NEW.status != 'delivered' THEN
    NEW.delivered_at = NULL;
    NEW.payout_date = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_payout_date ON user_sales;

-- Create trigger
CREATE TRIGGER trigger_set_payout_date
  BEFORE INSERT OR UPDATE ON user_sales
  FOR EACH ROW
  EXECUTE FUNCTION set_payout_date_on_delivery();

-- Update existing sales with 'delivered' status to have delivered_at and payout_date
-- (if they don't have it already)
UPDATE user_sales
SET 
  delivered_at = COALESCE(delivered_at, updated_at, created_at),
  payout_date = calculate_payout_date(COALESCE(delivered_at, updated_at, created_at))
WHERE status = 'delivered' 
  AND (delivered_at IS NULL OR payout_date IS NULL);

-- Create index for faster queries on payout_date
CREATE INDEX IF NOT EXISTS idx_user_sales_payout_date ON user_sales(payout_date) WHERE payout_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_sales_delivered_at ON user_sales(delivered_at) WHERE delivered_at IS NOT NULL;

-- Add comment to columns
COMMENT ON COLUMN user_sales.delivered_at IS 'Dátum doručenia objednávky';
COMMENT ON COLUMN user_sales.payout_date IS 'Dátum vyplatenia payout (14 dní od doručenia)';

