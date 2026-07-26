ALTER TABLE user_sales
ADD COLUMN IF NOT EXISTS manual_sale_items jsonb;

COMMENT ON COLUMN user_sales.manual_sale_items IS 'Optional list of line items for manual sales, used for multi-product contracts/PDFs';
