import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.pw.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0,
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chromium',
    baseURL,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    colorScheme: 'light',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'mobile-light',
      metadata: { theme: 'light', viewportLabel: '390' },
      use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-light',
      metadata: { theme: 'light', viewportLabel: '1440' },
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
    },
  ],
});
