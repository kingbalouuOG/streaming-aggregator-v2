/**
 * Phase 5.5 C11 — delete_own_account smoke test for a throwaway user.
 *
 * Signs in as the supplied throwaway user, invokes
 * supabase.rpc('delete_own_account'), and prints the result. Pair
 * with the pre/post snapshot SQL from the C11 step-by-step to verify
 * the cascade chain emptied every user-scoped table.
 *
 * Run AFTER manual sign-in on the app (or any other way of populating
 * the throwaway user's rows in profiles + user_services + watchlist +
 * etc.). The script itself only performs the RPC call; the
 * "populate first" step is on you.
 *
 * Usage:
 *   THROWAWAY_EMAIL='videx-delete-test-2026-05-15@example.com' \
 *   THROWAWAY_PASSWORD='…' \
 *   npx tsx scripts/test/c11-delete-account-smoke.ts
 *
 * Env: SUPABASE_URL / VITE_SUPABASE_URL and SUPABASE_ANON_KEY /
 *      VITE_SUPABASE_ANON_KEY must be in .env.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
  return env;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  const email = env.THROWAWAY_EMAIL;
  const password = env.THROWAWAY_PASSWORD;

  if (!url || !anonKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env.');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Set THROWAWAY_EMAIL and THROWAWAY_PASSWORD env vars.');
    process.exit(1);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Signing in as ${email}…`);
  const { data: signin, error: signinErr } = await supabase.auth.signInWithPassword({
    email, password,
  });
  if (signinErr || !signin.session) {
    console.error('Sign-in failed:', signinErr?.message ?? 'no session');
    process.exit(1);
  }
  console.log(`  OK — auth.uid() = ${signin.session.user.id}`);

  console.log(`\nInvoking public.delete_own_account()…`);
  const { error: rpcErr } = await supabase.rpc('delete_own_account');
  if (rpcErr) {
    console.error('  FAILED:', rpcErr.message);
    process.exit(1);
  }
  console.log('  OK — returned void, no error.');

  console.log(`\nNext: run the post-snapshot SQL from the C11 step-by-step.`);
  console.log(`Replace <THROWAWAY_UUID> with ${signin.session.user.id}.`);
  console.log(`Every row should return count = 0; auth.users should also return 0 rows.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
