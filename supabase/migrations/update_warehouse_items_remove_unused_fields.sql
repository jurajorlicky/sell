ALTER TABLE warehouse_items
ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'fa';

ALTER TABLE warehouse_items
DROP CONSTRAINT IF EXISTS warehouse_items_document_type_check;

ALTER TABLE warehouse_items
ADD CONSTRAINT warehouse_items_document_type_check
CHECK (document_type IN ('fa', 'zmluva'));

ALTER TABLE warehouse_items
DROP COLUMN IF EXISTS source_reference,
DROP COLUMN IF EXISTS expected_sale_price,
DROP COLUMN IF EXISTS location;
