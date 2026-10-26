import { defineConfig } from '@playwright/test';

// One golden-path run against `wrangler dev` with a fresh local D1, on a 375px phone viewport.
// Uses the installed Google Chrome, so no browser download is needed.
// The test server has its own port (8788, not `npm run dev`'s 8787), so the run works while the dev server is up.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: 'http://localhost:8788',
    channel: 'chrome',
    viewport: { width: 375, height: 812 },
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run e2e:server -w @fsl/api',
    url: 'http://localhost:8788/api/health',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
