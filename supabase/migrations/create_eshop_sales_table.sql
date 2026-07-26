-- Create eshop_sales table
-- Stores orders that came directly from the eshop (separate from consignment/user_sales)
-- Eshop sales are matched to consignment sales by order_number = user_sales.external_id

CREATE TABLE IF NOT EXISTS eshop_sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text NOT NULL,
  product_name text NOT NULL,
  size text,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  customer_name text,
  customer_email text,
  status text NOT NULL DEFAULT 'processing',
  tracking_number text,
  tracking_url text,
  notes text,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_eshop_sales_order_number ON eshop_sales(order_number);
CREATE INDEX IF NOT EXISTS idx_eshop_sales_status ON eshop_sales(status);
CREATE INDEX IF NOT EXISTS idx_eshop_sales_created_at ON eshop_sales(created_at DESC);

-- Enable RLS
ALTER TABLE eshop_sales ENABLE ROW LEVEL SECURITY;

-- Only admins can access eshop_sales (via admin_users table check)
CREATE POLICY "Admins can do everything on eshop_sales"
  ON eshop_sales
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
