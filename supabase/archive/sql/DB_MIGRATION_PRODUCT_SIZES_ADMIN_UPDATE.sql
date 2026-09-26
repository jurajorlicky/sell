-- Allow admin users to edit product size prices and statuses from Products admin.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'product_sizes'
      AND policyname = 'Allow admins to update product_sizes'
  ) THEN
    CREATE POLICY "Allow admins to update product_sizes"
      ON product_sizes
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() IN (SELECT id FROM admin_users)
      )
      WITH CHECK (
        auth.uid() IN (SELECT id FROM admin_users)
      );
  END IF;
END $$;

-- Optional verification
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'product_sizes'
ORDER BY policyname;
