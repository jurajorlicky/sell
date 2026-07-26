UPDATE user_products
SET vat_scheme = 'MARGIN'
WHERE vat_scheme IS NULL;
