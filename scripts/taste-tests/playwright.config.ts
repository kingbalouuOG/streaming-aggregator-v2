import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  testMatch: 'e2e-runner.spec.ts',
  timeout: 120000, // 2 minutes per test
  retries: 0, // No retries — we want to see failures
  workers: 1, // Sequential execution — one browser at a time
  fullyParallel: false,
  outputDir: './test-results/e2e/playwright-artifacts',

  use: {
    baseURL: 'http://localhost:3000',
    headless: true, // Run without visible browser window
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro dimensions (mobile-first app)
    actionTimeout: 10000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  // Start the dev server automatically before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },

  reporter: [
    ['list'], // Console output
    ['json', { outputFile: './test-results/e2e/playwright-report.json' }]
  ],
});
