CREATE TABLE IF NOT EXISTS public.invoice_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'netlify_cron',
  status text NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_import_runs_source_created_idx
  ON public.invoice_import_runs (source, created_at DESC);

ALTER TABLE public.invoice_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read invoice import runs" ON public.invoice_import_runs;
CREATE POLICY "Admins can read invoice import runs"
  ON public.invoice_import_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

GRANT SELECT ON public.invoice_import_runs TO authenticated;
GRANT ALL ON public.invoice_import_runs TO service_role;
