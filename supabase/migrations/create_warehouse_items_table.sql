CREATE TABLE IF NOT EXISTS warehouse_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  size text,
  sku text,
  image_url text,
  source_type text NOT NULL DEFAULT 'purchase' CHECK (source_type IN ('purchase', 'unclaimed_order')),
  purchase_price numeric NOT NULL DEFAULT 0,
  document_type text NOT NULL DEFAULT 'fa' CHECK (document_type IN ('fa', 'zmluva')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'sold')),
  notes text,
  assigned_sale_id uuid REFERENCES user_sales(id) ON DELETE SET NULL,
  assigned_eshop_sale_id uuid REFERENCES eshop_sales(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_items_single_assignment CHECK (
    assigned_sale_id IS NULL OR assigned_eshop_sale_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_warehouse_items_status ON warehouse_items(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_source_type ON warehouse_items(source_type);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_assigned_sale_id ON warehouse_items(assigned_sale_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_assigned_eshop_sale_id ON warehouse_items(assigned_eshop_sale_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_created_at ON warehouse_items(created_at DESC);

ALTER TABLE warehouse_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can do everything on warehouse_items" ON warehouse_items;
CREATE POLICY "Admins can do everything on warehouse_items"
  ON warehouse_items
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
