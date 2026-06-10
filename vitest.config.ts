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
    include: ['src/**/__tests__/**/*.test.ts'],
    // Existing tsx-script-style tests under src/lib/search/__tests__ and
    // the taste-v2 searchAttribution test run via the dedicated `npm run
    // test:search-*` scripts; excluded from the vitest discovery pass.
    // ENG-1 narrowed the taste-v2 exclusion from the whole directory to
    // the single legacy file so new vitest-style taste-v2 tests run under
    // `npm test`. (REPO-1 consolidates the tsx scripts into vitest.)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/lib/search/__tests__/**',
      'src/lib/taste-v2/__tests__/searchAttribution.test.ts',
    ],
  },
});
