import type { Page } from '@playwright/test';

export const GENEVA = { lat: 46.2044, lng: 6.1432 };

/**
 * A car driving from a point, in the app's simulated-position mode. `turn` is degrees per
 * second — the case that showed the camera stepping once a second instead of gliding.
 */
export const simUrl = (lat: number, lng: number, heading = 90, speed = 50, turn = 0): string =>
  `/?e2e&sim=${lat},${lng},${heading},${speed},${turn}`;

export type HookCar = {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  distanceM: number;
  /** Where the sprite is drawn, once nudged onto a road. */
  drawn: { lat: number; lng: number };
};

declare global {
  interface Window {
    __twMap?: {
      getStyle: () => { layers: unknown[] };
      getCenter: () => { lat: number; lng: number };
      getZoom: () => number;
    };
    __tw: {
      cars: () => HookCar[];
      summary: () => { online: number; near: number; selfWaves: number; nearby: { id: string } | null };
      self: () => { lat: number; lng: number; heading: number; speed: number } | null;
      identity: () => { id: string; model: string; colour: string; nick?: string } | null;
      frameCost: () => { mean: number; p95: number; samples: number };
      resetFrameCost: () => void;
    };
  }
}

/**
 * Navigate, retrying for a few seconds if the server refuses the connection. The dev server
 * is supervised and restarts if wrangler's proxy dies (apps/worker/scripts/dev-supervised.mjs);
 * a test that lands in that gap should wait for it, not fail for it.
 */
export async function open(page: Page, url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const refused = error instanceof Error && /ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(error.message);
      if (!refused || Date.now() > deadline) throw error;
      await page.waitForTimeout(1_000);
    }
  }
}

/**
 * Onboard once: pick the defaults and tap Go. `exact` matters: Playwright matches accessible
 * names by substring by default, and the map controls include "Go invisible".
 */
export async function onboard(page: Page, url: string): Promise<void> {
  await open(page, url);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
}

export const cars = (page: Page): Promise<HookCar[]> => page.evaluate(() => window.__tw.cars());

/**
 * A one-finger drag, as real touch events through CDP.
 *
 * Playwright's mouse does not translate into touch under mobile emulation, and the car screen
 * is touch-only anyway — so a drag driven by `page.mouse` was testing something no driver can
 * do, and silently doing nothing on the phone project.
 */
export async function dragBy(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  steps = 6,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1, force: 1, radiusX: 12, radiusY: 12 }];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(from.x, from.y),
  });
  for (let i = 1; i <= steps; i++) {
    // Spread over real time. Six moves dispatched back to back inside a millisecond are
    // classified as a tap rather than a drag, and the map does not pan at all.
    await page.waitForTimeout(20);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(from.x + (dx * i) / steps, from.y + (dy * i) / steps),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
