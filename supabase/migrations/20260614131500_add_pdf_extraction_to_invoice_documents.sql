ALTER TABLE public.invoice_documents
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extracted_total numeric,
  ADD COLUMN IF NOT EXISTS extracted_product text,
  ADD COLUMN IF NOT EXISTS extracted_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error text;

ALTER TABLE public.invoice_documents
  DROP CONSTRAINT IF EXISTS invoice_documents_extraction_status_check;

ALTER TABLE public.invoice_documents
  ADD CONSTRAINT invoice_documents_extraction_status_check
  CHECK (extraction_status IN ('pending', 'extracted', 'empty', 'error', 'skipped'));

CREATE INDEX IF NOT EXISTS invoice_documents_extracted_total_idx
  ON public.invoice_documents (extracted_total)
  WHERE extracted_total IS NOT NULL;
