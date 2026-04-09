import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for OutTheGroupchat.
 *
 * Run with: npm run test:e2e
 * Interactive UI: npm run test:e2e:ui
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run dev (or CI uses webServer config below)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: ['html', 'list'],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start dev server locally; in CI the workflow handles the server separately
  webServer: !process.env.CI
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      }
    : undefined,
});
