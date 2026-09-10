import { defineConfig, devices } from '@playwright/test';

// Package-local e2e for the ns-pyroscope embedder (see e2e/embedder-scroll.spec.ts).
// Runs the real embedder component and its actual source stylesheet through
// vite dev — intentionally NOT the production library build.
const PORT = Number(process.env.PORT ?? 5188);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Keep transient traces/screenshots out of the repo tree.
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? '/tmp/ns-pyroscope-e2e-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      // System Chrome avoids requiring downloaded Playwright browsers.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: `yarn vite --config e2e/vite.config.ts --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
