-- Update get_sales_status_display_text function to return English labels
CREATE OR REPLACE FUNCTION get_sales_status_display_text(status_code text)
RETURNS text AS $$
BEGIN
  RETURN CASE status_code
    WHEN 'accepted' THEN 'Accepted'
    WHEN 'processing' THEN 'Processing'
    WHEN 'shipped' THEN 'Shipped'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'completed' THEN 'Completed'
    WHEN 'cancelled' THEN 'Cancelled'
    WHEN 'returned' THEN 'Returned'
    ELSE status_code
  END;
END;
$$ LANGUAGE plpgsql;

