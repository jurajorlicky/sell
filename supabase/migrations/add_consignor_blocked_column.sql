-- Add consignor_blocked column to products table
-- When true, consignors cannot add this product to their listings

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'consignor_blocked'
  ) THEN
    ALTER TABLE products ADD COLUMN consignor_blocked boolean DEFAULT false NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_consignor_blocked ON products(consignor_blocked);

-- Allow admin users to update products (for consignor_blocked toggle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'Allow admins to update products'
  ) THEN
    CREATE POLICY "Allow admins to update products"
      ON products
      FOR UPDATE
      USING (
        auth.uid() IN (SELECT id FROM admin_users)
      )
      WITH CHECK (
        auth.uid() IN (SELECT id FROM admin_users)
      );
  END IF;
END $$;
