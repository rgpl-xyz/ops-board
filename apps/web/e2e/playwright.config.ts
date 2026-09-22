import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

import { readRepoEnv } from './fixtures/repo-env';

const repoRoot = resolve(__dirname, '../../..');
const repoEnv = readRepoEnv(repoRoot);

/**
 * The browser tier drives the shipped stack: the real API, the real database and
 * the built frontend. It lives outside `src` so `ng test` does not collect it.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // The journeys share one stack and one database, so they run in sequence.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // The https profile serves 7243, which apps/web/proxy.conf.json targets.
      // The probe uses it directly: plain http redirects to https, and the
      // development certificate is self-signed.
      command: 'dotnet run --project src/OpsBoard.Api --launch-profile https',
      // Relative to this config's directory: apps/web/e2e -> repository root.
      cwd: '../../..',
      url: 'https://localhost:7243/api/health',
      ignoreHTTPSErrors: true,
      env: {
        ...repoEnv,
        ASPNETCORE_ENVIRONMENT: 'Development',
        Demo__Enabled: 'true',
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm start',
      cwd: '..',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
