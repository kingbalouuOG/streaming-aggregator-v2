import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

// Phase 5 Step 9: Database generic re-enabled. The 47-error backlog
// (Json/unknown mismatches and nullability) is fixed per-file in
// commits 9.2 through 9.7. ESLint warning count target: <100.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
