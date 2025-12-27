/*
  # Create admin dashboard tables and functions

  1. New Tables
    - `profiles` - User profile information
      - `id` (uuid, primary key, references auth.users)
      - `first_name` (text)
      - `last_name` (text)
      - `profile_type` (text)
      - `vat_type` (text)
      - `company_name` (text)
      - `ico` (text)
      - `vat_number` (text)
      - `address` (text)
      - `popisne_cislo` (text)
      - `psc` (text)
      - `mesto` (text)
      - `krajina` (text)
      - `email` (text)
      - `telephone` (text)
      - `iban` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `user_products` - User product listings
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `product_id` (text)
      - `name` (text)
      - `size` (text)
      - `price` (decimal)
      - `image_url` (text)
      - `original_price` (decimal)
      - `payout` (decimal)
      - `sku` (text)
      - `created_at` (timestamp)

    - `products` - Master product catalog
      - `id` (text, primary key)
      - `name` (text)
      - `image_url` (text)
      - `sku` (text)
      - `created_at` (timestamp)

    - `product_price_view` - View for product pricing
      - `product_id` (text)
      - `size` (text)
      - `final_price` (decimal)
      - `final_status` (text)
      - `product_name` (text)
      - `image_url` (text)

  2. Security
    - Enable RLS on all tables
    - Add policies for users and admins
    - Create admin check functions
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  first_name text,
  last_name text,
  profile_type text DEFAULT 'Osobný' CHECK (profile_type IN ('Osobný', 'Obchodný')),
  vat_type text CHECK (vat_type IN ('PRIVATE', 'MARGIN', 'VAT 0%', '')),
  company_name text,
  ico text,
  vat_number text,
  address text,
  popisne_cislo text,
  psc text,
  mesto text,
  krajina text DEFAULT 'Slovensko',
  email text,
  telephone text,
  iban text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_products table
CREATE TABLE IF NOT EXISTS user_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  product_id text NOT NULL,
  name text NOT NULL,
  size text NOT NULL,
  price decimal(10,2) NOT NULL,
  image_url text,
  original_price decimal(10,2),
  payout decimal(10,2) NOT NULL DEFAULT 0,
  sku text,
  created_at timestamptz DEFAULT now()
);

-- Create products table (master catalog)
CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  name text NOT NULL,
  image_url text,
  sku text,
  created_at timestamptz DEFAULT now()
);

-- Create product_price_view as a table (simulating a view)
CREATE TABLE IF NOT EXISTS product_price_view (
  product_id text NOT NULL,
  size text NOT NULL,
  final_price decimal(10,2) NOT NULL,
  final_status text NOT NULL DEFAULT 'Skladom',
  product_name text,
  image_url text,
  PRIMARY KEY (product_id, size)
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_view ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile" ON profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- User products policies
CREATE POLICY "Users can read own products" ON user_products
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products" ON user_products
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products" ON user_products
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products" ON user_products
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Products policies (read-only for users)
CREATE POLICY "Anyone can read products" ON products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage products" ON products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Product price view policies
CREATE POLICY "Anyone can read product prices" ON product_price_view
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage product prices" ON product_price_view
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Insert sample data
INSERT INTO products (id, name, image_url, sku) VALUES
  ('nike-air-jordan-1', 'Nike Air Jordan 1 Retro High OG', 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg', 'NJ1-001'),
  ('adidas-yeezy-350', 'Adidas Yeezy Boost 350 V2', 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg', 'AY350-001'),
  ('nike-dunk-low', 'Nike Dunk Low Retro', 'https://images.pexels.com/photos/2048548/pexels-photo-2048548.jpeg', 'NDL-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_price_view (product_id, size, final_price, final_status, product_name, image_url) VALUES
  ('nike-air-jordan-1', '42', 180, 'Skladom', 'Nike Air Jordan 1 Retro High OG', 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg'),
  ('nike-air-jordan-1', '43', 185, 'Skladom', 'Nike Air Jordan 1 Retro High OG', 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg'),
  ('nike-air-jordan-1', '44', 190, 'Skladom', 'Nike Air Jordan 1 Retro High OG', 'https://images.pexels.com/photos/2529148/pexels-photo-2529148.jpeg'),
  ('adidas-yeezy-350', '42', 220, 'Skladom', 'Adidas Yeezy Boost 350 V2', 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg'),
  ('adidas-yeezy-350', '43', 225, 'Skladom', 'Adidas Yeezy Boost 350 V2', 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg'),
  ('nike-dunk-low', '42', 120, 'Skladom', 'Nike Dunk Low Retro', 'https://images.pexels.com/photos/2048548/pexels-photo-2048548.jpeg'),
  ('nike-dunk-low', '43', 125, 'Skladom', 'Nike Dunk Low Retro', 'https://images.pexels.com/photos/2048548/pexels-photo-2048548.jpeg')
ON CONFLICT (product_id, size) DO NOTHING;