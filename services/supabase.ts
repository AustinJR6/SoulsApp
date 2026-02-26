import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Fall back to placeholder strings so the module loads even when env vars are
// missing at build time (e.g. CI without secrets).  Actual API calls will fail
// gracefully — every caller already wraps Supabase in try/catch.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

const missingSupabaseEnv = !process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (missingSupabaseEnv && !__DEV__) {
  throw new Error(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in production build.'
  );
}

if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  console.warn('[Supabase] EXPO_PUBLIC_SUPABASE_URL not set — persistence disabled.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
