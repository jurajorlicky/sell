import { createClient } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';

// Environment variables - must be set in .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client with optimized settings
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

// Simple connection test (non-blocking)
const testConnection = async (): Promise<void> => {
  try {
   const { error } = await Promise.race([
  supabase.from('admin_settings').select('*').limit(1),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
]) as { error: PostgrestError | null };

if (error && !error.message.includes('permission denied')) {
  console.warn('Supabase connection warning:', error.message);
}
    
  } catch (err: unknown) {
    // Silently handle connection issues
    console.warn('Supabase connection test failed - continuing anyway');
  }
};

// Test connection in background
if (typeof window !== 'undefined') {
  setTimeout(testConnection, 100);
}