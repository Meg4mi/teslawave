import { expect, test } from '@playwright/test';
import { cars, GENEVA, onboard, simUrl } from './helpers';

/**
 * The milestone the whole plan is ordered around: two browsers see each other move.
 * It asserts on world state rather than pixels, and on movement rather than presence,
 * because a car that teleports every two seconds would pass a naive presence check.
 */
test('two drivers see each other, and the other car glides rather than teleports', async ({
  browser,
}) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 50));
  await onboard(pageB, simUrl(GENEVA.lat + 0.001, GENEVA.lng + 0.001, 270, 50));

  await expect
    .poll(async () => (await cars(pageA)).length, { timeout: 20_000, message: 'A should see B' })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await cars(pageB)).length, { timeout: 20_000, message: 'B should see A' })
    .toBeGreaterThan(0);

  // Samples a second apart: 50 km/h is ~14 m/s, so the car must move, and it must never jump.
  const id = (await cars(pageA))[0]?.id;
  expect(id).toBeDefined();

  const step = async (): Promise<number> => {
    const before = (await cars(pageA)).find((car) => car.id === id);
    await pageA.waitForTimeout(1_000);
    const after = (await cars(pageA)).find((car) => car.id === id);
    if (!before || !after) return 0;
    return Math.hypot(
      (after.lat - before.lat) * 111_320,
      (after.lng - before.lng) * 111_320 * Math.cos((GENEVA.lat * Math.PI) / 180),
    );
  };

  const steps: number[] = [];
  for (let i = 0; i < 4; i++) steps.push(await step());
  // Gliding, not teleporting: no single second may cover more than a few seconds of driving.
  for (const metres of steps) expect(metres).toBeLessThan(40);
  expect(Math.max(...steps)).toBeGreaterThan(3);

  await a.close();
  await b.close();
});

test('a driver who closes the tab disappears from the other map', async ({ browser }) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 40));
  await onboard(pageB, simUrl(GENEVA.lat + 0.0008, GENEVA.lng, 270, 40));
  await expect.poll(async () => (await cars(pageA)).length, { timeout: 20_000 }).toBeGreaterThan(0);

  await b.close();
  await expect
    .poll(async () => (await cars(pageA)).length, { timeout: 30_000 })
    .toBe(0);
  await a.close();
});
