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

/**
 * The map opens north-up and swings round to the car's heading as soon as the first fix
 * lands. Reading a bearing before that has settled measures the swing, not the gesture.
 */
const settled = async (page: Page): Promise<void> => {
  await expect
    .poll(
      async () => {
        const { bearing } = await state(page);
        const heading = (await page.evaluate(() => window.__tw.self()?.heading)) ?? 0;
        const off = Math.abs(bearing - heading);
        return off > 180 ? 360 - off : off;
      },
      { timeout: 10_000, message: 'the camera should settle on the heading' },
    )
    .toBeLessThan(1);
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
  // A pinch is dozens of touch events spaced in real time; on a busy runner three of them
  // run close to the default budget.
  test.slow();
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
  await settled(page);
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
  test.slow();
  const stage = await start(page);
  /*
   * The ceiling used to be 17, a zoom and a half above the one we follow at, which is why
   * pinching in felt like it did nothing. Getting past 17 at all is the claim; how many
   * pinches that takes depends on how much of each gesture the machine managed to deliver, so
   * it keeps going rather than assuming three is enough.
   */
  let zoom = (await state(page)).zoom;
  for (let i = 0; i < 8 && zoom <= 17.5; i++) {
    await pinch(page, stage, stage.narrow, stage.wide);
    const next = (await state(page)).zoom;
    expect(next).toBeGreaterThan(zoom);
    zoom = next;
  }
  expect(zoom).toBeGreaterThan(17.5);
});

test('the zoom you pinched to survives the camera picking you up again', async ({ page }) => {
  test.slow();
  const stage = await start(page);
  await pinch(page, stage, stage.wide, stage.narrow);
  const zoomed = (await state(page)).zoom;

  // The camera comes back to the car; it must not also drag the zoom back to its default.
  await expect
    .poll(async () => (await state(page)).held, { timeout: 20_000 })
    .toBe(false);
  expect((await state(page)).zoom).toBeCloseTo(zoomed, 1);
});

/**
 * The camera's shortcut is that it does not repaint the map when the driver has not moved
 * since the last time it did. That is only true while nothing else moves the map — and a pan
 * does. A car standing still, panned away from, therefore stayed panned away from: the next
 * frame saw a position it had already used and decided there was nothing to do. Reported from
 * a phone, where the car is usually parked. Both ways back are checked, because the button
 * and the hold running out on their own are two different paths to the same frame.
 */
test('the camera comes back to a car that is standing still', async ({ page }) => {
  test.slow();
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 0));
  await page.waitForFunction(() => window.__twMap !== undefined);
  await expect.poll(async () => page.evaluate(() => window.__tw.self() !== null)).toBe(true);

  const size = page.viewportSize() ?? { width: 1_920, height: 1_200 };
  const drag = async (): Promise<void> => {
    const from = { x: size.width / 2, y: size.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x - i * 20, from.y - i * 12);
    await page.mouse.up();
    const home = await page.evaluate(() => window.__tw.self());
    const away = await page.evaluate(() => window.__twMap?.getCenter());
    expect(Math.abs((away?.lat ?? 0) - (home?.lat ?? 0))).toBeGreaterThan(1e-4);
  };
  const offBy = async (): Promise<number> => {
    const centre = await page.evaluate(() => window.__twMap?.getCenter());
    const self = await page.evaluate(() => window.__tw.self());
    if (!centre || !self) return 1;
    return Math.max(Math.abs(centre.lat - self.lat), Math.abs(centre.lng - self.lng));
  };

  await drag();
  const button = page.getByRole('button', { name: 'Back to my car' });
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(offBy, { timeout: 5_000, message: 'the button should bring the camera back' })
    .toBeLessThan(1e-5);

  // And again without touching anything: the hold runs out by itself after a few seconds.
  await drag();
  await expect.poll(async () => (await state(page)).held, { timeout: 20_000 }).toBe(false);
  await expect
    .poll(offBy, { timeout: 5_000, message: 'the hold running out should bring it back too' })
    .toBeLessThan(1e-5);
});
