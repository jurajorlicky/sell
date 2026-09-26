-- Migration: Add offer expiration system for user_products
-- This migration adds automatic expiration of offers after configured days

-- 1. Add expires_at column to user_products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_products' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE user_products ADD COLUMN expires_at timestamptz;
    COMMENT ON COLUMN user_products.expires_at IS 'Dátum expirácie ponuky - po tomto dátume sa ponuka automaticky vymaže';
  END IF;
END $$;

-- 2. Add offer_expiration_days to admin_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'offer_expiration_days'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN offer_expiration_days integer DEFAULT 30 CHECK (offer_expiration_days IN (7, 14, 30));
    COMMENT ON COLUMN admin_settings.offer_expiration_days IS 'Počet dní do expirácie ponuky (7, 14, alebo 30)';
  END IF;
END $$;

-- 3. Create function to automatically delete expired offers
CREATE OR REPLACE FUNCTION delete_expired_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_products
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- 4. Create a scheduled job (pg_cron) to run daily
-- Note: This requires pg_cron extension. Run this separately in Supabase SQL Editor if you have pg_cron:
-- SELECT cron.schedule('delete-expired-offers', '0 2 * * *', 'SELECT delete_expired_offers();');
-- This runs daily at 2 AM

-- Note: If pg_cron is not available, expired offers will be filtered out in application queries
-- The application already filters: .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

-- 5. Update existing offers to have expiration date based on current setting
-- This sets expires_at for existing offers that don't have it
DO $$
DECLARE
  expiration_days integer;
BEGIN
  -- Get current expiration days setting or use default 30
  SELECT COALESCE(
    (SELECT offer_expiration_days FROM admin_settings WHERE offer_expiration_days IS NOT NULL LIMIT 1),
    30
  ) INTO expiration_days;
  
  -- Update existing offers without expiration
  UPDATE user_products
  SET expires_at = created_at + (expiration_days || ' days')::interval
  WHERE expires_at IS NULL;
END;
$$;

-- 6. Create index for faster expiration queries
CREATE INDEX IF NOT EXISTS idx_user_products_expires_at ON user_products(expires_at) WHERE expires_at IS NOT NULL;

