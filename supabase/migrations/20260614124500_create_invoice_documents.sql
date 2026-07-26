CREATE TABLE IF NOT EXISTS public.invoice_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL DEFAULT 'fa' CHECK (document_type IN ('fa')),
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('matched', 'unmatched')),
  bucket text NOT NULL DEFAULT 'invoices',
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  file_name text NOT NULL,
  order_number text,
  matched_target text CHECK (matched_target IN ('user_sales', 'eshop_sales')),
  user_sale_id uuid REFERENCES public.user_sales(id) ON DELETE SET NULL,
  eshop_sale_id uuid REFERENCES public.eshop_sales(id) ON DELETE SET NULL,
  payout numeric,
  source text NOT NULL DEFAULT 'email_import',
  email_subject text,
  email_from text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_documents_status_idx
  ON public.invoice_documents (status, imported_at DESC);

CREATE INDEX IF NOT EXISTS invoice_documents_order_number_idx
  ON public.invoice_documents (order_number);

CREATE INDEX IF NOT EXISTS invoice_documents_user_sale_idx
  ON public.invoice_documents (user_sale_id)
  WHERE user_sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_documents_eshop_sale_idx
  ON public.invoice_documents (eshop_sale_id)
  WHERE eshop_sale_id IS NOT NULL;

ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage invoice documents" ON public.invoice_documents;
CREATE POLICY "Admins can manage invoice documents"
  ON public.invoice_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE admin_users.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

GRANT ALL ON public.invoice_documents TO authenticated;
GRANT ALL ON public.invoice_documents TO service_role;
