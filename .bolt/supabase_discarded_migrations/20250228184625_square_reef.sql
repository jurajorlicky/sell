/*
  # Create user_sales table and related functionality

  1. New Tables
    - `user_sales`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `product_id` (string, references product from user_products)
      - `name` (text, product name)
      - `size` (text, product size)
      - `price` (decimal, sale price)
      - `image_url` (text, product image)
      - `payout` (decimal, seller payout amount)
      - `created_at` (timestamp)
      - `status` (text, sale status)
  2. Security
    - Enable RLS on `user_sales` table
    - Add policies for authenticated users to read their own sales
    - Add policies for admins to manage all sales
*/

CREATE TABLE IF NOT EXISTS user_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  size text NOT NULL,
  price decimal(10,2) NOT NULL,
  image_url text,
  payout decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  original_product_id uuid
);

ALTER TABLE user_sales ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own sales
CREATE POLICY "Users can read own sales"
  ON user_sales
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create admin_users table to track admin privileges
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Allow admins to read admin_users
CREATE POLICY "Admins can read admin_users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Allow admins to read all user_products
CREATE POLICY "Admins can read all user_products"
  ON user_products
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Allow admins to read all user_sales
CREATE POLICY "Admins can read all user_sales"
  ON user_sales
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Allow admins to insert user_sales
CREATE POLICY "Admins can insert user_sales"
  ON user_sales
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Allow admins to update user_sales
CREATE POLICY "Admins can update user_sales"
  ON user_sales
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
  );
END;
$$;