import { expect, test, type Page } from '@playwright/test';
import { GENEVA, onboard, simUrl } from './helpers';

const metresApart = (
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined,
): number =>
  !a || !b
    ? Number.NaN
    : Math.hypot(
        (a.lat - b.lat) * 111_320,
        (a.lng - b.lng) * 111_320 * Math.cos((GENEVA.lat * Math.PI) / 180),
      );

/**
 * One round trip, so nothing here can straddle the six-second hold. Asking the page three
 * separate questions is what made the first version of this file fail at device scale 2 and
 * pass at 1: input dispatch is slow enough there that the hold had already expired by the
 * time the assertion ran, and the test was measuring the harness, not the app.
 */
const snapshot = (page: Page) =>
  page.evaluate(() => ({
    centre: window.__twMap?.getCenter() ?? null,
    self: window.__tw.self(),
    held: document.querySelector('.map__recentre')?.hasAttribute('hidden') === false,
  }));

const start = async (page: Page): Promise<void> => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 50));
  await page.waitForFunction(() => window.__twMap !== undefined);
};

const centreOf = (page: Page): { x: number; y: number } => {
  const size = page.viewportSize() ?? { width: 1_920, height: 1_200 };
  return { x: size.width / 2, y: size.height / 2 };
};

/**
 * The camera used to follow the driver unconditionally, thirty times a second, which meant
 * every gesture was fighting a jumpTo for as long as it lasted — pinch-to-zoom on the car
 * screen felt like it was slipping out from under your fingers. A gesture now wins.
 */
test('a drag makes the map let go instead of snapping back', async ({ page }) => {
  await start(page);
  const { x, y } = centreOf(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 260, y - 160, { steps: 4 });
  await page.mouse.up();

  const after = await snapshot(page);
  expect(after.held).toBe(true);
  expect(metresApart(after.centre, after.self)).toBeGreaterThan(150);
});

test('the pill brings you straight back, well before the camera would resume on its own', async ({
  page,
}) => {
  await start(page);
  const { x, y } = centreOf(page);

  // A wheel is one event rather than a dozen: the click has to land inside the hold window.
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  const heldAt = Date.now();
  expect((await snapshot(page)).held).toBe(true);

  await page.locator('.map__recentre').click();
  const back = await snapshot(page);
  expect(back.held).toBe(false);
  expect(metresApart(back.centre, back.self)).toBeLessThan(80);
  // If this took six seconds we would be watching the automatic resume, not the button.
  expect(Date.now() - heldAt).toBeLessThan(4_000);
});

test('the camera picks the driver up again a few seconds after the last gesture', async ({
  page,
}) => {
  await start(page);
  const { x, y } = centreOf(page);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 220, y, { steps: 4 });
  await page.mouse.up();

  // Nobody should have to find a button: losing your own car while driving is not an option.
  await expect
    .poll(async () => metresApart((await snapshot(page)).centre, (await snapshot(page)).self), {
      timeout: 20_000,
      message: 'the camera should come back on its own',
    })
    .toBeLessThan(80);
});

test('a tap to look at a car does not stop the map following you', async ({ page }) => {
  await start(page);
  const { x, y } = centreOf(page);

  await page.mouse.click(x + 4, y + 4);
  expect((await snapshot(page)).held).toBe(false);
});
