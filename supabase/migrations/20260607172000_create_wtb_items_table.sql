CREATE TABLE IF NOT EXISTS wtb_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id integer REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  sku text,
  sizes text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wtb_items_product_id_unique UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS idx_wtb_items_position ON wtb_items(position, created_at);
CREATE INDEX IF NOT EXISTS idx_wtb_items_product_id ON wtb_items(product_id);

ALTER TABLE wtb_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can do everything on wtb_items" ON wtb_items;
CREATE POLICY "Admins can do everything on wtb_items"
  ON wtb_items
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
