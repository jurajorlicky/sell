-- Expired consign offers must stop affecting the storefront immediately, even
-- when the optional cleanup cron has not deleted them yet. Once the last active
-- offer ends, the view falls back to the catalog's original price and status.

CREATE OR REPLACE VIEW public.product_price_view AS
SELECT
  ps.product_id,
  ps.size,
  COALESCE(min_up.price, ps.original_price) AS final_price,
  COALESCE(min_up.status, ps.status) AS final_status,
  p.name AS product_name,
  p.image_url,
  min_up.user_id AS owner
FROM public.product_sizes ps
LEFT JOIN public.products p ON ps.product_id = p.id
LEFT JOIN LATERAL (
  SELECT
    up.price,
    up.status,
    up.user_id
  FROM public.user_products up
  WHERE up.product_id = ps.product_id
    AND up.size = ps.size
    AND up.status = ANY (ARRAY['Skladom'::text, 'Skladom Expres'::text])
    AND (up.expires_at IS NULL OR up.expires_at > now())
  ORDER BY up.price, up.created_at, up.id
  LIMIT 1
) min_up ON true;

COMMENT ON VIEW public.product_price_view IS
  'Lowest active, unexpired consign price/status with automatic fallback to the catalog original price/status.';

-- Keep cleanup available for storage hygiene. Pricing correctness does not
-- depend on this function being scheduled.
CREATE OR REPLACE FUNCTION public.delete_expired_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_products
  WHERE expires_at IS NOT NULL
    AND expires_at <= now();
END;
$$;
