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
}
