import type { Page } from '@playwright/test';

export const GENEVA = { lat: 46.2044, lng: 6.1432 };

/** A car driving east at 50 km/h from a point, in the app's simulated-position mode. */
export const simUrl = (lat: number, lng: number, heading = 90, speed = 50): string =>
  `/?e2e&sim=${lat},${lng},${heading},${speed}`;

export type HookCar = {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  distanceM: number;
};

declare global {
  interface Window {
    __tw: {
      cars: () => HookCar[];
      summary: () => { online: number; near: number; selfWaves: number; nearby: { id: string } | null };
      self: () => { lat: number; lng: number } | null;
      identity: () => { id: string } | null;
      frameCost: () => { mean: number; p95: number; samples: number };
      resetFrameCost: () => void;
    };
  }
}

/**
 * Onboard once: pick the defaults and tap Go. `exact` matters: Playwright matches accessible
 * names by substring by default, and the map controls include "Go invisible".
 */
export async function onboard(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
}

export const cars = (page: Page): Promise<HookCar[]> => page.evaluate(() => window.__tw.cars());
