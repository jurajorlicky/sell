/*
  # Add product status tracking system

  1. Changes to Tables
    - Add `status` column to `user_products` table
    - Add `status_history` table for tracking status changes
    - Add `status_notes` for admin comments

  2. New Tables
    - `product_status_history` - Track all status changes with timestamps
      - `id` (uuid, primary key)
      - `product_id` (uuid, references user_products)
      - `old_status` (text)
      - `new_status` (text)
      - `changed_by` (uuid, references auth.users)
      - `notes` (text)
      - `created_at` (timestamp)

  3. Security
    - Enable RLS on new tables
    - Add policies for users and admins
*/

-- Add status column to user_products if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_products' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_products ADD COLUMN status text DEFAULT 'submitted' CHECK (status IN (
      'submitted',    -- Odoslaný
      'received',     -- Prijatý
      'inspected',    -- Kontrolovaný
      'photographed', -- Fotografovaný
      'online',       -- Online
      'sold',         -- Predaný
      'rejected'      -- Zamietnutý
    ));
  END IF;
END $$;

-- Add status_notes column for admin comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_products' AND column_name = 'status_notes'
  ) THEN
    ALTER TABLE user_products ADD COLUMN status_notes text;
  END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_products' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE user_products ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create product status history table
CREATE TABLE IF NOT EXISTS product_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES user_products(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_status_history ENABLE ROW LEVEL SECURITY;

-- Users can read status history for their own products
CREATE POLICY "Users can read own product status history" ON product_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_products 
      WHERE user_products.id = product_status_history.product_id 
      AND user_products.user_id = auth.uid()
    )
  );

-- Admins can read all status history
CREATE POLICY "Admins can read all product status history" ON product_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admins can insert status history
CREATE POLICY "Admins can insert product status history" ON product_status_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Function to automatically log status changes
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO product_status_history (
      product_id,
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

-- Create trigger for automatic status logging
DROP TRIGGER IF EXISTS trigger_log_status_change ON user_products;
CREATE TRIGGER trigger_log_status_change
  BEFORE UPDATE ON user_products
  FOR EACH ROW
  EXECUTE FUNCTION log_status_change();

-- Update existing products to have default status
UPDATE user_products SET status = 'submitted' WHERE status IS NULL;

-- Create function to get status display text
CREATE OR REPLACE FUNCTION get_status_display_text(status_code text)
RETURNS text AS $$
BEGIN
  RETURN CASE status_code
    WHEN 'submitted' THEN 'Odoslaný'
    WHEN 'received' THEN 'Prijatý'
    WHEN 'inspected' THEN 'Kontrolovaný'
    WHEN 'photographed' THEN 'Fotografovaný'
    WHEN 'online' THEN 'Online'
    WHEN 'sold' THEN 'Predaný'
    WHEN 'rejected' THEN 'Zamietnutý'
    ELSE status_code
  END;
END;
$$ LANGUAGE plpgsql;