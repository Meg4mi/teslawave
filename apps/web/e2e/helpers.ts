import type { Page, TestInfo } from '@playwright/test';

export const GENEVA = { lat: 46.2044, lng: 6.1432 };

/**
 * The same place, moved east by a whole degree for every project, retry and repeat, so a run
 * of a spec never shares a hub cell with an earlier run of itself.
 *
 * The hub outlives a test and a report outlives the hub's tick by up to ninety minutes, so a
 * pin left by the `tesla` project was still there when `tesla-dpr2` reported the same thing
 * in the same spot, and was confirmed instead of placed. A degree is about 77 km here, twice
 * the width of a cell, so the cells a client holds cannot reach the next spot along.
 */
export function apart(
  at: { lat: number; lng: number },
  testInfo: TestInfo,
): { lat: number; lng: number } {
  const projects = testInfo.config.projects.length;
  const project = testInfo.config.projects.findIndex((p) => p.name === testInfo.project.name);
  const attempts = testInfo.project.retries + 1;
  const slot = (testInfo.repeatEachIndex * projects + project) * attempts + testInfo.retry;
  return { lat: at.lat, lng: at.lng + slot };
}

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
  /** Where the sprite is drawn. The same as lat/lng since ADR-0024; kept for the tests. */
  drawn: { lat: number; lng: number };
};

declare global {
  interface Window {
    __twMap?: {
      getStyle: () => { layers: unknown[] };
      getCenter: () => { lat: number; lng: number };
      getZoom: () => number;
      /** Where a point on the map lands on the screen, for tapping a pin the app drew. */
      project: (lngLat: [number, number]) => { x: number; y: number };
    };
    __tw: {
      cars: () => HookCar[];
      summary: () => { online: number; near: number; selfWaves: number; nearby: { id: string } | null };
      reports: () => Array<{ id: string; kind: string; lat: number; lng: number; n: number; distanceM: number }>;
      self: () => { lat: number; lng: number; heading: number; speed: number } | null;
      identity: () => { id: string; model: string; colour: string; nick?: string; status?: string } | null;
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
export async function onboard(page: Page, url: string, nick?: string): Promise<void> {
  await open(page, url);
  // The name is optional in the app and optional here: most drivers never type one. Named
  // rather than "the textbox": the status a driver can write is one as well.
  if (nick !== undefined) await page.getByRole('textbox', { name: 'Name (optional)' }).fill(nick);
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
