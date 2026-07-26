ALTER TABLE eshop_sales
ADD COLUMN IF NOT EXISTS fa_url text;

CREATE INDEX IF NOT EXISTS idx_eshop_sales_fa_url
ON eshop_sales(fa_url)
WHERE fa_url IS NOT NULL;
