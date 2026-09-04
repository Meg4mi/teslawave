import { expect, test, type Page } from '@playwright/test';
import { GENEVA, onboard, simUrl } from './helpers';

/**
 * A real two-finger pinch, dispatched through CDP. Playwright's mouse cannot express one, so
 * the first version of the camera work was only ever tested with a drag — and pinch is the
 * gesture that was actually reported broken on the car screen.
 */
async function pinch(
  page: Page,
  centre: { x: number; y: number },
  fromGap: number,
  toGap: number,
  steps = 10,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const points = (gap: number) => [
    { x: centre.x - gap / 2, y: centre.y, id: 1, force: 1, radiusX: 12, radiusY: 12 },
    { x: centre.x + gap / 2, y: centre.y, id: 2, force: 1, radiusX: 12, radiusY: 12 },
  ];

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(fromGap) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(fromGap + ((toGap - fromGap) * i) / steps),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const state = (page: Page) =>
  page.evaluate(() => ({
    zoom: window.__twMap?.getZoom() ?? 0,
    bearing: (window.__twMap as unknown as { getBearing: () => number } | undefined)?.getBearing() ?? 0,
    held: document.querySelector('.map__recentre')?.hasAttribute('hidden') === false,
  }));

/**
 * Gestures are sized from the viewport, not in fixed pixels. A 620 px spread is a comfortable
 * two-handed pinch on the car screen and runs clean off the side of a phone, where the touch
 * points then land outside the window and the map never sees them.
 */
type Stage = { x: number; y: number; narrow: number; wide: number };

const start = async (page: Page): Promise<Stage> => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 50));
  await page.waitForFunction(() => window.__twMap !== undefined);
  const size = page.viewportSize() ?? { width: 1_920, height: 1_200 };
  const small = Math.min(size.width, size.height);
  return { x: size.width / 2, y: size.height / 2, narrow: small * 0.18, wide: small * 0.7 };
};

test('spreading two fingers zooms the map in', async ({ page }) => {
  const stage = await start(page);
  const before = await state(page);

  await pinch(page, stage, stage.narrow, stage.wide);

  const after = await state(page);
  expect(after.zoom).toBeGreaterThan(before.zoom + 0.5);
  expect(after.held).toBe(true);
});

test('closing two fingers zooms the map out', async ({ page }) => {
  const stage = await start(page);
  const before = await state(page);

  await pinch(page, stage, stage.wide, stage.narrow);

  const after = await state(page);
  expect(after.zoom).toBeLessThan(before.zoom - 0.5);
});

test('a pinch never rotates the map away from heading-up', async ({ page }) => {
  const stage = await start(page);
  const centre = stage;
  // The map is heading-up, so the bearing is the car's heading; the question is whether a
  // twisting pinch moves it off that. A heading-up map that quietly rotates is disorienting.
  const before = await state(page);
  const cdp = await page.context().newCDPSession(page);
  const step = stage.narrow * 0.5;
  const at = (angle: number, gap: number, id: number) => ({
    x: centre.x + Math.cos(angle) * gap,
    y: centre.y + Math.sin(angle) * gap,
    id,
    force: 1,
    radiusX: 12,
    radiusY: 12,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at(0, stage.narrow, 1), at(Math.PI, stage.narrow, 2)],
  });
  for (let i = 1; i <= 10; i++) {
    const angle = (i / 10) * 1.2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        at(angle, stage.narrow + i * step * 0.2, 1),
        at(angle + Math.PI, stage.narrow + i * step * 0.2, 2),
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();

  const after = await state(page);
  expect(after.zoom).toBeGreaterThan(before.zoom);
  expect(Math.abs(after.bearing - before.bearing)).toBeLessThan(1);
});

test('the zoom buttons work without a pinch at all', async ({ page }) => {
  await start(page);
  const before = await state(page);

  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomedIn = await state(page);
  expect(zoomedIn.zoom).toBeGreaterThan(before.zoom + 0.5);
  // Tapping a button is not taking hold of the map: it should still be following you.
  expect(zoomedIn.held).toBe(false);

  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  expect((await state(page)).zoom).toBeLessThan(before.zoom);
});

test('pinching in has room to go somewhere', async ({ page }) => {
  const stage = await start(page);
  // The ceiling used to be a zoom and a half above the follow zoom, which is why pinching in
  // felt like it did nothing.
  for (let i = 0; i < 3; i++) await pinch(page, stage, stage.narrow, stage.wide);
  expect((await state(page)).zoom).toBeGreaterThan(18);
});

test('the zoom you pinched to survives the camera picking you up again', async ({ page }) => {
  const stage = await start(page);
  await pinch(page, stage, stage.wide, stage.narrow);
  const zoomed = (await state(page)).zoom;

  // The camera comes back to the car; it must not also drag the zoom back to its default.
  await expect
    .poll(async () => (await state(page)).held, { timeout: 20_000 })
    .toBe(false);
  expect((await state(page)).zoom).toBeCloseTo(zoomed, 1);
});
