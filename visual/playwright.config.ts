import { defineConfig } from '@playwright/test';

const dist = process.env.FRONTEND_DIST ?? '../frontend/dist';
const port = Number(process.env.VISUAL_PORT ?? 4173);

export default defineConfig({
  testDir: 'scenarios',
  outputDir: process.env.VISUAL_RESULTS ?? 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    video: process.env.VISUAL_VIDEO ? { mode: 'on', size: { width: 1280, height: 900 } } : 'off',
  },
  webServer: {
    command: `node src/serve.ts ${dist} ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
