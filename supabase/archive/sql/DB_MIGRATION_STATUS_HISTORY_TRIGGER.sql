/*
  # Ensure sales status history trigger is properly set up

  This migration ensures that the trigger for logging sales status changes
  is properly configured and working.
*/

-- Function to automatically log sales status changes
CREATE OR REPLACE FUNCTION log_sales_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO sales_status_history (
      sale_id,
      old_status,
      new_status,
      changed_by,
      notes
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid(),
      NEW.status_notes
    );
  END IF;
  
  -- Update the updated_at timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_log_sales_status_change ON user_sales;

-- Create trigger for automatic sales status logging
CREATE TRIGGER trigger_log_sales_status_change
  BEFORE UPDATE ON user_sales
  FOR EACH ROW
  EXECUTE FUNCTION log_sales_status_change();

-- Also log initial status when sale is created (if needed)
-- This can be done by adding a trigger on INSERT, but it's optional
-- since the initial status is usually 'accepted' or 'pending'

-- Verify trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_log_sales_status_change';

