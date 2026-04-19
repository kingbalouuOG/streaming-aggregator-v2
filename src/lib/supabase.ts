import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

// Note: Not using createClient<Database> because it exposes 47 pre-existing
// type mismatches in files outside Phase 4 scope (supabaseStorage.ts,
// interactions.ts, etc.). Phase 4 pipeline files handle typing via explicit
// result casts. Full Database generic is a Phase 5/6 cleanup task.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
