/*
  # Add signature upload to profiles table

  1. Changes to profiles table
    - Add signature_url column for storing signature image URL
    - Signature will be stored in Supabase Storage bucket 'signatures'

  2. Security
    - Ensure RLS policies allow reading signature_url
*/

-- Add signature_url column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'signature_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN signature_url text;
  END IF;
END $$;

-- Add comment to column
COMMENT ON COLUMN profiles.signature_url IS 'URL podpisu používateľa (obrázok)';

