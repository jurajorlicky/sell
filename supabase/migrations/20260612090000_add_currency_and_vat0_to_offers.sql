ALTER TABLE admin_settings
ADD COLUMN IF NOT EXISTS eur_to_czk_rate numeric NOT NULL DEFAULT 25;

ALTER TABLE user_products
ADD COLUMN IF NOT EXISTS input_currency text NOT NULL DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS input_price numeric,
ADD COLUMN IF NOT EXISTS exchange_rate numeric,
ADD COLUMN IF NOT EXISTS is_vat0 boolean NOT NULL DEFAULT false;

UPDATE user_products
SET input_currency = 'EUR',
    input_price = price
WHERE input_price IS NULL;

ALTER TABLE user_products
DROP CONSTRAINT IF EXISTS user_products_input_currency_check;

ALTER TABLE user_products
ADD CONSTRAINT user_products_input_currency_check
CHECK (input_currency IN ('EUR', 'CZK'));
