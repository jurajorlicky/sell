import { supabase } from './supabase';
import { logger } from './logger';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ddzmuxcavpgbzhirzlqt.supabase.co';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-sale-email-ts`;

/**
 * Gets the authentication token for the edge function
 * Returns the session access token if available, otherwise falls back to anon key
 */
async function getAuthToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
  } catch (error) {
    logger.warn('Failed to get session token', error);
  }
  
  // Fallback to anon key
  return import.meta.env.VITE_SUPABASE_ANON_KEY || '';
}

/**
 * Sends a new sale email notification
 */
export async function sendNewSaleEmail(data: {
  email: string;
  productName: string;
  size: string;
  price: number;
  payout: number;
  external_id: string;
  image_url?: string;
  sku: string;
}): Promise<void> {
  try {
    const token = await getAuthToken();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'new_sale',
        ...data
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Email send failed', {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
        type: 'new_sale'
      });
      throw new Error(`Email send failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    logger.info('New sale email sent successfully', { result, email: data.email });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.error('Email send timeout after 10 seconds', { type: 'new_sale' });
      throw new Error('Email send timeout');
    }
    logger.error('Error sending new sale email', { error, email: data.email });
    throw error;
  }
}

/**
 * Sends a status change email notification
 */
export async function sendStatusChangeEmail(data: {
  email: string;
  saleId: string;
  productName: string;
  oldStatus: string;
  newStatus: string;
  notes?: string;
}): Promise<void> {
  try {
    const token = await getAuthToken();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'status_change',
        ...data
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Email send failed', {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
        type: 'status_change'
      });
      throw new Error(`Email send failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    logger.info('Status change email sent successfully', { result, email: data.email, saleId: data.saleId });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.error('Email send timeout after 10 seconds', { type: 'status_change' });
      throw new Error('Email send timeout');
    }
    logger.error('Error sending status change email', { error, email: data.email, saleId: data.saleId });
    throw error;
  }
}

/**
 * Sends a tracking information email notification
 */
export async function sendTrackingEmail(data: {
  email: string;
  saleId: string;
  productName: string;
  trackingNumber: string;
  carrier: string;
  trackingUrl?: string;
  label_url?: string;
  notes?: string;
}): Promise<void> {
  try {
    const token = await getAuthToken();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'tracking',
        ...data
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('Email send failed', {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
        type: 'tracking'
      });
      throw new Error(`Email send failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    logger.info('Tracking email sent successfully', { result, email: data.email, saleId: data.saleId });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.error('Email send timeout after 10 seconds', { type: 'tracking' });
      throw new Error('Email send timeout');
    }
    logger.error('Error sending tracking email', { error, email: data.email, saleId: data.saleId });
    throw error;
  }
}


