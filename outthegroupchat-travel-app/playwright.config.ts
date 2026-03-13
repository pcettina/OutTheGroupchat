import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for OutTheGroupchat.
 *
 * Run with: npm run test:e2e
 * Interactive UI: npm run test:e2e:ui
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run dev (or use webServer config below)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

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

  // Automatically start the dev server in CI
  webServer: process.env.CI
    ? {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120 * 1000,
      }
    : undefined,
});
