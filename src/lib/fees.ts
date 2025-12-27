import { supabase } from './supabase';
import { logger } from './logger';

interface AdminSettings {
  fee_percent: number;
  fee_fixed: number;
  offer_expiration_days?: number;
}

let cachedSettings: AdminSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getFees(): Promise<AdminSettings> {
  const now = Date.now();
  
  // Return cached settings if they're still valid
  if (cachedSettings && (now - cacheTimestamp) < CACHE_DURATION) {
    logger.debug('Returning cached fees', { cachedSettings });
    return cachedSettings;
  }


  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('fee_percent, fee_fixed, offer_expiration_days')
      .single();


    if (error) throw error;

    if (data) {
      cachedSettings = {
        fee_percent: data.fee_percent,
        fee_fixed: data.fee_fixed,
        offer_expiration_days: data.offer_expiration_days || 30
      };
      cacheTimestamp = now;
      logger.info('Fees loaded and cached', { cachedSettings });
      return cachedSettings;
    }

    // Default values if no settings found
    const defaultSettings = { fee_percent: 0.2, fee_fixed: 5 };
    cachedSettings = defaultSettings;
    cacheTimestamp = now;
    return defaultSettings;
  } catch (error: any) {
    logger.error('Error fetching admin settings', error);
    
    // Return cached settings if available, otherwise defaults
    if (cachedSettings) {
      logger.warn('Using cached fees due to error', { cachedSettings });
      return cachedSettings;
    }
    
    const defaultSettings = { fee_percent: 0.2, fee_fixed: 5 };
    logger.warn('Using default fees due to error', { defaultSettings });
    return defaultSettings;
  }
}

export function calculatePayout(price: number, feePercent: number, feeFixed: number): number {
  const result = price * (1 - feePercent) - feeFixed;
  return Math.max(0, result); // Ensure payout is never negative
}

// Clear cache function for manual refresh
export function clearFeesCache(): void {
  logger.debug('Clearing fees cache');
  cachedSettings = null;
  cacheTimestamp = 0;
}