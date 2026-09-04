import { expect, test, type Page } from '@playwright/test';
import { dragBy, GENEVA, onboard, simUrl } from './helpers';

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

/**
 * A drag sized from the viewport. Fixed pixel offsets are a car-screen habit: 260 px left of
 * centre on a phone is off the side of the window, and the map never sees the gesture.
 */
const centreOf = (page: Page): { x: number; y: number; reach: number } => {
  const size = page.viewportSize() ?? { width: 1_920, height: 1_200 };
  return { x: size.width / 2, y: size.height / 2, reach: Math.min(size.width, size.height) * 0.28 };
};

/**
 * The camera used to follow the driver unconditionally, thirty times a second, which meant
 * every gesture was fighting a jumpTo for as long as it lasted — pinch-to-zoom on the car
 * screen felt like it was slipping out from under your fingers. A gesture now wins.
 */
test('a drag makes the map let go instead of snapping back', async ({ page }) => {
  await start(page);
  const { x, y, reach } = centreOf(page);

  await dragBy(page, { x, y }, -reach, -reach * 0.6);

  const after = await snapshot(page);
  expect(after.held).toBe(true);
  expect(metresApart(after.centre, after.self)).toBeGreaterThan(80);
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
  const { x, y, reach } = centreOf(page);

  await dragBy(page, { x, y }, -reach, 0);

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

/**
 * The device gives us about one fix a second. Drawn straight, that is a camera that holds
 * still for a second and then jumps — at 100 km/h a 28 metre step, and through a bend the
 * whole turn arriving at once. Which is what "the map is laggy when I turn" was.
 */
test('the map turns continuously, not once a second', async ({ page }) => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 0, 60, 25));
  await page.waitForFunction(() => window.__twMap !== undefined);

  const samples = await page.evaluate(async () => {
    const read = (): number =>
      (window.__twMap as unknown as { getBearing: () => number } | undefined)?.getBearing() ?? 0;
    const out: { t: number; b: number }[] = [];
    // Sampled well inside one fix interval: if the camera only moved when a fix landed, most
    // of these would be identical.
    for (let i = 0; i < 30; i++) {
      out.push({ t: performance.now(), b: read() });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return out;
  });

  const moved = samples.filter(
    (s, i) => i > 0 && Math.abs(s.b - (samples[i - 1]?.b ?? s.b)) > 0.05,
  );
  expect(moved.length).toBeGreaterThan(samples.length * 0.5);

  // Three seconds of a 25 deg/s turn is about 75 degrees, less whatever the smoothing lags by.
  const total = samples.reduce((sum, s, i) => {
    const step = Math.abs(s.b - (samples[i - 1]?.b ?? s.b));
    return sum + (step > 180 ? 360 - step : step);
  }, 0);
  expect(total).toBeGreaterThan(40);

  /*
   * And it never lurches. Rate, not raw step: a busy page delivers these samples late, so a
   * step of ten degrees can mean four hundred milliseconds rather than a jump. The car is
   * turning at 25 deg/s; the old once-a-second camera covered that in a single frame, which
   * is upwards of a thousand deg/s.
   */
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;
    const step = Math.abs(current.b - previous.b);
    const rate = ((step > 180 ? 360 - step : step) / Math.max(1, current.t - previous.t)) * 1_000;
    expect(rate).toBeLessThan(100);
  }
});
