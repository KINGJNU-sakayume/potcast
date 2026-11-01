import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5180',
    url: 'http://127.0.0.1:5180', reuseExistingServer: !process.env.CI,
    env: { VITE_ENABLE_PREVIEW: 'true' },
  },
});
