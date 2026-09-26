/*
  # Auto-complete sales when payout_date arrives

  This migration adds functionality to automatically change status to 'completed'
  when payout_date <= now() for delivered sales.
*/

-- Function to automatically complete sales when payout_date arrives
CREATE OR REPLACE FUNCTION auto_complete_payout_sales()
RETURNS TRIGGER AS $$
BEGIN
  -- If payout_date has arrived and status is still 'delivered', change to 'completed'
  IF NEW.status = 'delivered' 
     AND NEW.payout_date IS NOT NULL 
     AND NEW.payout_date <= NOW() 
     AND OLD.status = 'delivered' THEN
    NEW.status = 'completed';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_complete_payout ON user_sales;

-- Create trigger to auto-complete on update
CREATE TRIGGER trigger_auto_complete_payout
  BEFORE UPDATE ON user_sales
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_payout_sales();

-- Also update the set_payout_date_on_delivery function to check payout_date
CREATE OR REPLACE FUNCTION set_payout_date_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is 'delivered' and delivered_at is set, calculate payout_date
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NOT NULL THEN
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
    
    -- If payout_date has already passed, set status to 'completed'
    IF NEW.payout_date <= NOW() THEN
      NEW.status = 'completed';
    END IF;
  END IF;
  
  -- If delivered_at is updated, recalculate payout_date
  IF NEW.delivered_at IS NOT NULL AND (OLD.delivered_at IS NULL OR NEW.delivered_at != OLD.delivered_at) THEN
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
    
    -- If payout_date has already passed, set status to 'completed'
    IF NEW.payout_date <= NOW() THEN
      NEW.status = 'completed';
    END IF;
  END IF;
  
  -- If status changes to 'delivered' and delivered_at is not set, set it to now
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at = NOW();
    NEW.payout_date = calculate_payout_date(NEW.delivered_at);
    
    -- If payout_date has already passed (shouldn't happen, but just in case), set status to 'completed'
    IF NEW.payout_date <= NOW() THEN
      NEW.status = 'completed';
    END IF;
  END IF;
  
  -- If status changes from 'delivered' to something else, clear delivered_at and payout_date
  IF OLD.status = 'delivered' AND NEW.status != 'delivered' AND NEW.status != 'completed' THEN
    NEW.delivered_at = NULL;
    NEW.payout_date = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing sales where payout_date has passed to 'completed'
UPDATE user_sales
SET status = 'completed'
WHERE status = 'delivered' 
  AND payout_date IS NOT NULL 
  AND payout_date <= NOW();

