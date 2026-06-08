import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the AI-generated scripts.
 * Scripts are run programmatically from lib/executor.ts via npx playwright test <file>.
 * This config sets sensible defaults for headless single-file runs.
 */
export default defineConfig({
  // No testDir — executor passes the file path directly
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    // Give slow network pages time to load
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
