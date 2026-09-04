import { expect, test } from '@playwright/test';
import { cars, GENEVA, onboard, simUrl } from './helpers';

test('two cars in range can wave, and both counters move', async ({ browser }) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  // ~22 m apart in truth: even with both positions fuzzed by up to 100 m each, they stay
  // inside the 150 m prompt range.
  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 10));
  await onboard(pageB, simUrl(GENEVA.lat + 0.0002, GENEVA.lng, 90, 10));

  await expect.poll(async () => (await cars(pageA)).length, { timeout: 20_000 }).toBeGreaterThan(0);

  const waveButton = pageA.locator('.wave');
  await expect(waveButton).toBeVisible({ timeout: 20_000 });
  // The label is two lines now: the verb, then who it is aimed at.
  await expect(waveButton.locator('.wave__verb')).toHaveText('Wave');
  await expect(waveButton.locator('.wave__target')).toContainText(/at the .+ Model/);
  await expect(waveButton).toHaveAttribute('aria-label', /^Wave at the/);
  await waveButton.click();

  // The toast specifically: receiving your first wave also raises the milestone card, and
  // both are status regions.
  await expect(pageB.locator('.toast')).toContainText(/waved at you|Waved back/, {
    timeout: 15_000,
  });
  // The reward beat: a first wave is a milestone, and it is personal, not a ranking.
  await expect(pageB.locator('.milestone')).toContainText(/First wave/, { timeout: 15_000 });
  await expect
    .poll(async () => pageA.evaluate(() => window.__tw.summary().selfWaves), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await a.close();
  await b.close();
});

test('tapping a car opens its card', async ({ browser }) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 5));
  await onboard(pageB, simUrl(GENEVA.lat + 0.0006, GENEVA.lng, 90, 5));
  await expect.poll(async () => (await cars(pageA)).length, { timeout: 20_000 }).toBeGreaterThan(0);

  // Project the other car to screen space through the map and tap it.
  const point = await pageA.evaluate(() => {
    const car = window.__tw.cars()[0];
    const self = window.__tw.self();
    if (!car || !self) return null;
    return { car, self };
  });
  expect(point).not.toBeNull();

  const canvas = pageA.locator('.map__gl canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // The other car sits due north of us, so it is above centre on a track-up map heading east.
  await pageA.mouse.click(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2);

  await a.close();
  await b.close();
});
