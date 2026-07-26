-- Remove product_sizes.price from pricing logic.
-- Final price is the lowest active consigner price first, then product_sizes.original_price from Shoptet/feed.

ALTER TABLE product_sizes
ALTER COLUMN price DROP NOT NULL;

UPDATE product_sizes
SET price = NULL
WHERE price IS NOT NULL;

DROP VIEW IF EXISTS product_price_view;

CREATE VIEW product_price_view AS
SELECT
  ps.product_id,
  ps.size,
  COALESCE(min_up.price, ps.original_price) AS final_price,
  COALESCE(min_up.status, ps.status) AS final_status,
  p.name AS product_name,
  p.image_url,
  min_up.user_id AS owner
FROM product_sizes ps
LEFT JOIN products p ON ps.product_id = p.id
LEFT JOIN LATERAL (
  SELECT
    up.price,
    up.status,
    up.user_id
  FROM user_products up
  WHERE up.product_id = ps.product_id
    AND up.size = ps.size
    AND up.status = ANY (ARRAY['Skladom'::text, 'Skladom Expres'::text])
  ORDER BY up.price, up.created_at, up.id
  LIMIT 1
) min_up ON true
GROUP BY
  ps.product_id,
  ps.size,
  ps.original_price,
  ps.status,
  min_up.price,
  min_up.status,
  min_up.user_id,
  p.name,
  p.image_url;
