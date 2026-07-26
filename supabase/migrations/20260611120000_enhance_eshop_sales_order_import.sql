ALTER TABLE eshop_sales
ADD COLUMN IF NOT EXISTS shoptet_order_id text,
ADD COLUMN IF NOT EXISTS shoptet_status text,
ADD COLUMN IF NOT EXISTS order_created_at timestamptz,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS order_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS order_product_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS order_extra_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS order_item_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount_paid numeric,
ADD COLUMN IF NOT EXISTS product_id text,
ADD COLUMN IF NOT EXISTS source_name text,
ADD COLUMN IF NOT EXISTS sales_channel_name text,
ADD COLUMN IF NOT EXISTS shop_remark text,
ADD COLUMN IF NOT EXISTS original_order_number text,
ADD COLUMN IF NOT EXISTS imported_at timestamptz;

UPDATE eshop_sales
SET line_item_key = concat(order_number, ':', coalesce(sku, ''), ':', coalesce(size, ''), ':', id::text)
WHERE line_item_key IS NULL OR line_item_key = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eshop_sales_order_line_unique
ON eshop_sales(order_number, line_item_key);

CREATE INDEX IF NOT EXISTS idx_eshop_sales_shoptet_order_id
ON eshop_sales(shoptet_order_id);

CREATE INDEX IF NOT EXISTS idx_eshop_sales_product_id
ON eshop_sales(product_id);

CREATE INDEX IF NOT EXISTS idx_eshop_sales_original_order_number
ON eshop_sales(original_order_number);

DROP VIEW IF EXISTS eshop_sales_profit_view;

CREATE OR REPLACE VIEW eshop_sales_profit_view AS
SELECT
  es.id,
  es.order_number,
  es.line_item_key,
  es.product_name,
  es.size,
  es.sku,
  es.product_id,
  es.price,
  es.quantity,
  es.status,
  es.shoptet_status,
  es.customer_name,
  es.customer_email,
  es.image_url,
  COALESCE(es.order_created_at, es.created_at) AS sale_date,
  es.order_total,
  es.order_product_total,
  es.order_extra_total,
  es.order_item_count,
  es.amount_paid,
  es.shop_remark,
  es.original_order_number,
  es.imported_at,
  us.id AS linked_sale_id,
  us.payout AS linked_payout,
  us.price AS linked_sale_price,
  us.status AS linked_sale_status,
  us.user_id AS linked_user_id,
  (es.price - COALESCE(us.payout, 0)) AS estimated_profit,
  CASE
    WHEN us.id IS NULL THEN 'unmatched'
    ELSE 'matched'
  END AS match_status
FROM eshop_sales es
LEFT JOIN LATERAL (
  SELECT user_sales.*
  FROM user_sales
  WHERE user_sales.external_id IN (es.order_number, es.original_order_number)
    AND (
      es.size IS NULL
      OR user_sales.size IS NULL
      OR trim(user_sales.size) = trim(es.size)
    )
    AND (
      es.sku IS NULL
      OR user_sales.sku IS NULL
      OR split_part(user_sales.sku, '/', 1) = split_part(es.sku, '/', 1)
      OR lower(user_sales.name) = lower(es.product_name)
    )
  ORDER BY
    CASE WHEN user_sales.external_id = es.original_order_number THEN 0 ELSE 1 END,
    CASE WHEN trim(coalesce(user_sales.size, '')) = trim(coalesce(es.size, '')) THEN 0 ELSE 1 END,
    abs(COALESCE(user_sales.price, 0) - COALESCE(es.price, 0)),
    user_sales.created_at DESC
  LIMIT 1
) us ON true;
