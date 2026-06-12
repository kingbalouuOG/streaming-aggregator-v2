import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Phase 5.5 C6a (IN-PX-25): vitest rig for pure-function unit tests.
// Tests live alongside source under __tests__/ directories.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Stub the Supabase env so importing modules whose chain touches
  // src/lib/supabase.ts (which throws when VITE_SUPABASE_URL is absent)
  // works on env-less CI runners — AND so the pure-function tests are
  // hermetic locally: they can never reach real Supabase even by
  // accident. Same stub-value pattern as build-verify.yml.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://stub.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('stub-anon-key'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // REPO-1: all tests (src + scripts) are vitest suites under
    // __tests__/ — the legacy tsx-script runners are gone, so `npm test`
    // is the single entry point.
    include: [
      'src/**/__tests__/**/*.test.ts',
      'scripts/**/__tests__/**/*.test.ts',
      // PLAT-2: the Worker's pure rules (no Workers/Hono imports there).
      'workers/api/src/**/__tests__/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
});
