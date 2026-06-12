import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Phase 5 Step 9: Database generic re-enabled. The 47-error backlog
// (Json/unknown mismatches and nullability) is fixed per-file in
// commits 9.2 through 9.7. ESLint warning count target: <100.
//
// PLAT-3: construction is LAZY (first property access) instead of
// module-scope. The videx-api Worker imports engine modules that import
// this singleton transitively; at module scope `import.meta.env` only
// exists under Vite, so eager construction crashed the Worker at init.
// In the browser nothing changes — the client is built on first use
// during boot. Server code must never call this singleton (it would
// throw); server entry points construct their own client via
// src/lib/server/userScope.ts.

let _client: SupabaseClient<Database> | null = null;

function getClient(): SupabaseClient<Database> {
  if (!_client) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
    }
    _client = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, _receiver) {
      const client = getClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  },
);
