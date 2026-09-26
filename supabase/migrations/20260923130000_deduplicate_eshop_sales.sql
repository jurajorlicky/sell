-- Make an e-shop order line identity independent from XML item ordering and
-- consolidate historical duplicates before enforcing uniqueness.

CREATE TEMP TABLE eshop_sales_duplicate_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY
        order_number,
        lower(trim(COALESCE(NULLIF(sku, ''), NULLIF(product_id, ''), product_name))),
        lower(trim(COALESCE(NULLIF(size, ''), 'no-size')))
      ORDER BY
        (fa_url IS NOT NULL) DESC,
        (tracking_number IS NOT NULL) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY
        order_number,
        lower(trim(COALESCE(NULLIF(sku, ''), NULLIF(product_id, ''), product_name))),
        lower(trim(COALESCE(NULLIF(size, ''), 'no-size')))
      ORDER BY
        (fa_url IS NOT NULL) DESC,
        (tracking_number IS NOT NULL) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id
    ) AS duplicate_rank
  FROM public.eshop_sales
)
SELECT id AS duplicate_id, keeper_id
FROM ranked
WHERE duplicate_rank > 1;

UPDATE public.invoice_documents document
SET eshop_sale_id = duplicate.keeper_id,
    updated_at = now()
FROM eshop_sales_duplicate_map duplicate
WHERE document.eshop_sale_id = duplicate.duplicate_id;

DO $$
BEGIN
  IF to_regclass('public.warehouse_items') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.warehouse_items item
      SET assigned_eshop_sale_id = duplicate.keeper_id,
          updated_at = now()
      FROM eshop_sales_duplicate_map duplicate
      WHERE item.assigned_eshop_sale_id = duplicate.duplicate_id
    $sql$;
  END IF;
END $$;

DELETE FROM public.eshop_sales sale
USING eshop_sales_duplicate_map duplicate
WHERE sale.id = duplicate.duplicate_id;

UPDATE public.eshop_sales
SET line_item_key = concat(
  lower(trim(COALESCE(NULLIF(sku, ''), NULLIF(product_id, ''), product_name))),
  '::',
  lower(trim(COALESCE(NULLIF(size, ''), 'no-size')))
);

DROP INDEX IF EXISTS public.idx_eshop_sales_order_line_unique;

CREATE UNIQUE INDEX idx_eshop_sales_order_line_unique
ON public.eshop_sales(order_number, line_item_key);

CREATE INDEX IF NOT EXISTS idx_eshop_sales_order_date_sort
ON public.eshop_sales(order_created_at DESC NULLS LAST, order_number, line_item_key);
