/**
 * Supabase client — React Native shadow of supabase.ts (NATIVE-2 W6).
 *
 * Two native-specific needs the web client doesn't have:
 *  1. Session persistence: supabase-js defaults to web localStorage,
 *     which doesn't exist under Hermes. We hand it the MMKV-backed
 *     storage adapter (the same store storage.native uses) so the
 *     session survives app restarts.
 *  2. detectSessionInUrl: false — there is no URL bar to parse OAuth
 *     fragments from on native.
 *
 * The web file's lazy Proxy singleton exists because the videx-api
 * Worker imports the engine transitively and `import.meta.env` only
 * exists under Vite. Metro never bundles for the Worker, so this shadow
 * can construct eagerly — env.native reads process.env.EXPO_PUBLIC_*,
 * inlined at build.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { env } from './env';
import storage from './storage';

const supabaseUrl = env.SUPABASE_URL;
const supabaseAnonKey = env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables',
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      // MMKV-backed (storage.native default export). supabase-js writes
      // its session under `sb-<ref>-auth-token` into this same store.
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
