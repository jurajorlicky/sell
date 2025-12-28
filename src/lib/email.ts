import { supabase } from './supabase';
import { logger } from './logger';

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
    logger.info('Sending new sale email', { email: data.email, type: 'new_sale' });
    
    const { data: result, error } = await supabase.functions.invoke('send-sale-email-ts', {
      body: {
        type: 'new_sale',
        ...data
      }
    });

    if (error) {
      logger.error('Email send failed', {
        error,
        type: 'new_sale',
        email: data.email
      });
      throw new Error(`Email send failed: ${error.message || JSON.stringify(error)}`);
    }

    logger.info('New sale email sent successfully', { result, email: data.email });
  } catch (error: any) {
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
    logger.info('Sending status change email', { email: data.email, saleId: data.saleId, type: 'status_change' });
    
    const { data: result, error } = await supabase.functions.invoke('send-sale-email-ts', {
      body: {
        type: 'status_change',
        ...data
      }
    });

    if (error) {
      logger.error('Email send failed', {
        error,
        type: 'status_change',
        email: data.email,
        saleId: data.saleId
      });
      throw new Error(`Email send failed: ${error.message || JSON.stringify(error)}`);
    }

    logger.info('Status change email sent successfully', { result, email: data.email, saleId: data.saleId });
  } catch (error: any) {
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
    logger.info('Sending tracking email', { email: data.email, saleId: data.saleId, type: 'tracking' });
    
    const { data: result, error } = await supabase.functions.invoke('send-sale-email-ts', {
      body: {
        type: 'tracking',
        ...data
      }
    });

    if (error) {
      logger.error('Email send failed', {
        error,
        type: 'tracking',
        email: data.email,
        saleId: data.saleId
      });
      throw new Error(`Email send failed: ${error.message || JSON.stringify(error)}`);
    }

    logger.info('Tracking email sent successfully', { result, email: data.email, saleId: data.saleId });
  } catch (error: any) {
    logger.error('Error sending tracking email', { error, email: data.email, saleId: data.saleId });
    throw error;
  }
}


