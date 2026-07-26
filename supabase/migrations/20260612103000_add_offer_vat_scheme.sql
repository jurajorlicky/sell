ALTER TABLE user_products
ADD COLUMN IF NOT EXISTS vat_scheme text;

UPDATE user_products
SET vat_scheme = CASE
  WHEN is_vat0 IS TRUE THEN 'VAT0'
  ELSE vat_scheme
END
WHERE vat_scheme IS NULL;

ALTER TABLE user_products
DROP CONSTRAINT IF EXISTS user_products_vat_scheme_check;

ALTER TABLE user_products
ADD CONSTRAINT user_products_vat_scheme_check
CHECK (vat_scheme IS NULL OR vat_scheme IN ('VAT0', 'MARGIN'));
