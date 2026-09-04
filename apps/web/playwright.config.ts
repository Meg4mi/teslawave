import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Use the Chromium that is already on the machine when there is one (CI images ship it
 * pre-installed), instead of downloading a second copy per Playwright version.
 */
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

/**
 * The car screen is the primary target, so it is the primary project. 2026.26 changed the
 * browser's pixel density, so every layout assertion runs at two densities: hardcoding one
 * is exactly the bug that broke other apps on that firmware.
 */
const CAR = { width: 1920, height: 1200 };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'tesla',
      // The performance spec runs simulated drivers, so it gets a project of its own and is
      // kept out of the functional ones: leaked drivers would make their assertions lie.
      testIgnore: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: CAR,
        deviceScaleFactor: 1,
        hasTouch: true,
        launchOptions: launch,
      },
    },
    {
      name: 'tesla-dpr2',
      testIgnore: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: CAR,
        deviceScaleFactor: 2,
        hasTouch: true,
        launchOptions: launch,
      },
    },
    {
      name: 'phone',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7'], hasTouch: true, launchOptions: launch },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: CAR,
        deviceScaleFactor: 1,
        hasTouch: true,
        launchOptions: launch,
      },
    },
  ],
  webServer: {
    // The real worker serving the real bundle: the same thing that gets deployed.
    command:
      'pnpm --filter @teslawave/web build && pnpm --filter @teslawave/worker db:local && ' +
      'pnpm --filter @teslawave/worker dev --port 8787',
    url: 'http://127.0.0.1:8787/api/whereami',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'pipe',
  },
});
