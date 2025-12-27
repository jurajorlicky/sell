/*
  # Add status tracking to user_sales table

  1. Changes to user_sales table
    - Add status column with proper values for sales process
    - Add status_notes column for admin comments
    - Add updated_at column for tracking changes

  2. New Tables
    - `sales_status_history` - Track all status changes for sales

  3. Security
    - Enable RLS on sales_status_history table
    - Add policies for users and admins
    - Create trigger for automatic status logging
*/

-- Add status column to user_sales if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_sales DROP CONSTRAINT IF EXISTS user_sales_status_check;
    ALTER TABLE user_sales ADD COLUMN status text DEFAULT 'accepted' CHECK (status IN (
      'accepted',     -- Prijatý predaj
      'processing',   -- Spracováva sa
      'shipped',      -- Odoslaný
      'delivered',    -- Doručený
      'completed',    -- Dokončený (payout vyplatený)
      'cancelled',    -- Zrušený
      'returned'      -- Vrátený
    ));
  END IF;
END $$;

-- Add status_notes column for admin comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'status_notes'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN status_notes text;
  END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create sales status history table
CREATE TABLE IF NOT EXISTS sales_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES user_sales(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_status_history ENABLE ROW LEVEL SECURITY;

-- Users can read status history for their own sales
CREATE POLICY "Users can read own sales status history" ON sales_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_sales 
      WHERE user_sales.id = sales_status_history.sale_id 
      AND user_sales.user_id = auth.uid()
    )
  );

-- Admins can read all sales status history
CREATE POLICY "Admins can read all sales status history" ON sales_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can insert sales status history
CREATE POLICY "Admins can insert sales status history" ON sales_status_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

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

-- Create trigger for automatic sales status logging
DROP TRIGGER IF EXISTS trigger_log_sales_status_change ON user_sales;
CREATE TRIGGER trigger_log_sales_status_change
  BEFORE UPDATE ON user_sales
  FOR EACH ROW
  EXECUTE FUNCTION log_sales_status_change();

-- Update existing sales to have default status
UPDATE user_sales SET status = 'accepted' WHERE status IS NULL OR status = 'pending';

-- Create function to get sales status display text
CREATE OR REPLACE FUNCTION get_sales_status_display_text(status_code text)
RETURNS text AS $$
BEGIN
  RETURN CASE status_code
    WHEN 'accepted' THEN 'Prijatý'
    WHEN 'processing' THEN 'Spracováva sa'
    WHEN 'shipped' THEN 'Odoslaný'
    WHEN 'delivered' THEN 'Doručený'
    WHEN 'completed' THEN 'Dokončený'
    WHEN 'cancelled' THEN 'Zrušený'
    WHEN 'returned' THEN 'Vrátený'
    ELSE status_code
  END;
END;
$$ LANGUAGE plpgsql;