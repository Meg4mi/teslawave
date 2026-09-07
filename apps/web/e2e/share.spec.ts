import { expect, test } from '@playwright/test';
import { cars, GENEVA, onboard, simUrl } from './helpers';

/**
 * The share card, drawn for real.
 *
 * Everything about this feature is pixels on a canvas, which no unit test can look at: a
 * throw inside the drawing, a car scaled off the edge, or a card that comes out as an empty
 * rectangle all pass a type check and produce something nobody would send to anyone.
 */
test('a driver who has waved can open a card with their car actually drawn on it', async ({
  browser,
}) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  const errors: string[] = [];
  pageA.on('pageerror', (error) => errors.push(error.message));

  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 10));
  await onboard(pageB, simUrl(GENEVA.lat + 0.0002, GENEVA.lng, 90, 10));
  await expect.poll(async () => (await cars(pageA)).length, { timeout: 20_000 }).toBeGreaterThan(0);

  await expect(pageA.locator('.wave')).toBeVisible({ timeout: 20_000 });
  await pageA.locator('.wave').click();
  await expect
    .poll(async () => pageA.evaluate(() => window.__tw.summary().selfWaves), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // "Around you" is the only way in: a share button on the wave itself would be asking
  // someone to compose a post at 100 km/h.
  await pageA.locator('.hud__stats').click();
  const share = pageA.getByRole('button', { name: 'Share your card' });
  await expect(share).toBeVisible({ timeout: 10_000 });
  await share.click();

  const canvas = pageA.locator('canvas.share__card');
  await expect(canvas).toBeVisible();

  // The card has to actually contain a drawing. A canvas that threw half way through is
  // still a canvas, and still passes a visibility check.
  const ink = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const seen = new Set<string>();
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      seen.add(key);
      if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 200) lit++;
    }
    return { colours: seen.size, lit, pixels: data.length / 4, width: c.width, height: c.height };
  });

  expect(ink).not.toBeNull();
  expect(ink!.width).toBeGreaterThan(0);
  // A card that is one flat colour is a card the drawing never landed on.
  expect(ink!.colours, 'the card should be a drawing, not a rectangle').toBeGreaterThan(50);
  // The car, the count and the domain are all light on a dark ground: some of it must be lit,
  // and most of it must not, or the layout has blown out.
  expect(ink!.lit / ink!.pixels).toBeGreaterThan(0.002);
  expect(ink!.lit / ink!.pixels).toBeLessThan(0.5);

  expect(errors, errors.join('\n')).toHaveLength(0);
  await a.close();
  await b.close();
});
