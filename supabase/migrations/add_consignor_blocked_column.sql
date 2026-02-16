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
