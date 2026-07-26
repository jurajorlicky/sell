ALTER TABLE eshop_sales
ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS line_item_key text;

UPDATE eshop_sales
SET quantity = 1
WHERE quantity IS NULL;

CREATE INDEX IF NOT EXISTS idx_eshop_sales_line_item_key
ON eshop_sales(order_number, line_item_key);
