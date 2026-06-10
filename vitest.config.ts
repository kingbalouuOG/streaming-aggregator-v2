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
