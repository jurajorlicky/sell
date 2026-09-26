-- Backfill the direct invoice -> e-shop order link. One invoice belongs to an
-- order, so for multi-item orders we point at the first stable order row while
-- the UI also resolves it by order_number for every item in that order.

UPDATE public.invoice_documents document
SET eshop_sale_id = (
      SELECT sale.id
      FROM public.eshop_sales sale
      WHERE sale.order_number = document.order_number
         OR sale.original_order_number = document.order_number
      ORDER BY sale.order_created_at NULLS LAST, sale.line_item_key, sale.id
      LIMIT 1
    ),
    updated_at = now()
WHERE document.document_type = 'fa'
  AND document.eshop_sale_id IS NULL
  AND document.order_number IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.eshop_sales sale
    WHERE sale.order_number = document.order_number
       OR sale.original_order_number = document.order_number
  );
