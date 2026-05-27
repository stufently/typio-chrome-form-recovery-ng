import { defineConfig } from '@playwright/test';

// Playwright extension tests only run in bundled Chromium —
// https://playwright.dev/docs/chrome-extensions
// We therefore configure exactly one project. The extension is loaded from
// the WXT chrome build output; CI builds it before running these tests.

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // extension state is shared across tests
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
});
