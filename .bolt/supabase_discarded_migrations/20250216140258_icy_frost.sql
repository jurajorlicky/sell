/*
  # Create admin settings table

  1. New Tables
    - `admin_settings`
      - `id` (uuid, primary key)
      - `fee_percent` (decimal, default 0.2)
      - `fee_fixed` (decimal, default 5)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `admin_settings` table
    - Add policy for authenticated users to read settings
*/

CREATE TABLE IF NOT EXISTS admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_percent decimal(10,2) NOT NULL DEFAULT 0.2,
  fee_fixed decimal(10,2) NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insert default values
INSERT INTO admin_settings (fee_percent, fee_fixed)
VALUES (0.2, 5)
ON CONFLICT DO NOTHING;

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read settings
CREATE POLICY "Anyone can read admin settings"
  ON admin_settings
  FOR SELECT
  TO authenticated
  USING (true);