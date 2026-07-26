export interface Product {
  id: string;
  name: string;
  size: string;
  price: number;
  image_url: string | null;
  original_price?: number;
  product_id: string;
  user_id: string;
  payout: number;
  sku: string;
  expires_at?: string;
  input_currency?: 'EUR' | 'CZK' | null;
  input_price?: number | null;
  exchange_rate?: number | null;
  is_vat0?: boolean | null;
  vat_scheme?: 'VAT0' | 'MARGIN' | null;
}
