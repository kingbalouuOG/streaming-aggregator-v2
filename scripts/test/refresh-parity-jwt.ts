/**
 * Refresh the PARITY_USER_JWT secret used by the foryou-parity probe.
 *
 * Supabase user JWTs default to a 1-week expiry. The parity-probe
 * workflow needs a valid token for the test user to call the
 * render-foryou-rows Edge Function under the same auth shape as a
 * real client. This script signs in as the test user (via email +
 * password) and prints the fresh access token to stdout. Pipe into
 * `gh secret set PARITY_USER_JWT --body -` or copy by hand into the
 * GitHub repo's Actions secrets.
 *
 * ─── Cadence ───────────────────────────────────────────────────────
 *
 * Run weekly (or whenever the workflow fails with a 401 on the Edge
 * call). One-week cadence is the right cycle; the CI workflow's
 * soft-skip path covers the gap between a token expiring and the
 * refresh landing.
 *
 * ─── Usage ─────────────────────────────────────────────────────────
 *
 *   PARITY_TEST_EMAIL='videx-parity-test@…' \
 *   PARITY_TEST_PASSWORD='…' \
 *   npx tsx scripts/test/refresh-parity-jwt.ts
 *
 *   # then copy stdout into the PARITY_USER_JWT GitHub secret, or:
 *   PARITY_TEST_EMAIL='…' PARITY_TEST_PASSWORD='…' \
 *   npx tsx scripts/test/refresh-parity-jwt.ts | gh secret set PARITY_USER_JWT --body -
 *
 *   ⚠ POSIX shells only. PowerShell's pipe re-encodes stdout and bakes
 *   a trailing newline INSIDE the secret — the Edge function then
 *   rejects it with UNAUTHORIZED_INVALID_JWT_FORMAT (bit us at ENG-1
 *   close-out, 2026-06-10). PowerShell-safe form:
 *     $jwt = (npx tsx scripts/test/refresh-parity-jwt.ts).Trim()
 *     gh secret set PARITY_USER_JWT --body $jwt
 *
 * Env keys SUPABASE_URL / SUPABASE_ANON_KEY come from .env (loaded
 * via the same loader pattern as scripts/_inspect_foryou_parity.mjs).
 *
 * ─── Future: GitHub Actions automation ─────────────────────────────
 *
 * A weekly workflow with the `gh` CLI installed could run this script
 * and update the secret via `gh api … PUT`. Deferred to Phase 6+; the
 * manual one-command path is good enough for prototype scale.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // .env may not exist in CI; fall through to process.env.
  }
  return env;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  const email = env.PARITY_TEST_EMAIL;
  const password = env.PARITY_TEST_PASSWORD;

  if (!url || !anonKey) {
    console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY in .env or process.env.');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Set PARITY_TEST_EMAIL and PARITY_TEST_PASSWORD env vars.');
    console.error('These are the credentials for the test user flagged is_test_user = true.');
    process.exit(1);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error('Sign-in failed:', error?.message ?? 'no session returned');
    process.exit(1);
  }

  // Print the access token to stdout. Anything else goes to stderr so
  // a pipe into `gh secret set --body -` captures only the JWT.
  console.error(`OK: refreshed JWT for ${email}; user id ${data.session.user.id}`);
  console.error(`Expires at: ${new Date((data.session.expires_at ?? 0) * 1000).toISOString()}`);
  process.stdout.write(data.session.access_token);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
