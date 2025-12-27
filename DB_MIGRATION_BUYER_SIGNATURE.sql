-- Add buyer_signature_url column to admin_settings table
ALTER TABLE admin_settings 
ADD COLUMN IF NOT EXISTS buyer_signature_url TEXT;

-- Add comment
COMMENT ON COLUMN admin_settings.buyer_signature_url IS 'URL to admin/buyer signature image for PDF purchase agreements';
