# How to Add sale_type Column to user_sales Table

## Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the following SQL:

```sql
-- Add sale_type column to user_sales table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_sales' AND column_name = 'sale_type'
  ) THEN
    ALTER TABLE user_sales ADD COLUMN sale_type text DEFAULT 'operational' CHECK (sale_type IN ('operational', 'invoice'));
    
    -- Set all existing sales to 'operational' by default
    UPDATE user_sales SET sale_type = 'operational' WHERE sale_type IS NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_sales_sale_type ON user_sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_user_sales_user_id_sale_type ON user_sales(user_id, sale_type);
```

4. Click **Run** to execute the migration
5. Verify the column was added by running: `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_sales' AND column_name = 'sale_type';`

## Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push
```

This will run all migrations in the `supabase/migrations/` folder.

## Verification

After running the migration, verify it worked:

```sql
SELECT sale_type, COUNT(*) 
FROM user_sales 
GROUP BY sale_type;
```

This should show all existing sales with `sale_type = 'operational'`.

