import { expect, test } from '@playwright/test';
import { cars, GENEVA, onboard, simUrl } from './helpers';

/**
 * A report goes the whole way round: tapped on one screen, placed by the hub where that car
 * is, drawn on the other screen, and said there once because it is within a kilometre.
 * Two browsers, the real hub, the real wire (ADR-0040).
 */
test('a report on one screen is a pin and an alert on the other', async ({ browser }) => {
  const a = await browser.newContext({ permissions: ['geolocation'] });
  const b = await browser.newContext({ permissions: ['geolocation'] });
  const pageA = await a.newPage();
  const pageB = await b.newPage();

  // ~220 m apart: inside the alert range, and inside the 300 m within which a second report
  // of the same thing confirms the first rather than adding a pin.
  await onboard(pageA, simUrl(GENEVA.lat, GENEVA.lng, 90, 10));
  await onboard(pageB, simUrl(GENEVA.lat + 0.002, GENEVA.lng, 90, 10));
  await expect.poll(async () => (await cars(pageA)).length, { timeout: 20_000 }).toBeGreaterThan(0);

  await pageA.getByRole('button', { name: 'Report', exact: true }).click();
  await pageA.getByRole('button', { name: /^Police/ }).click();
  await expect(pageA.getByText('Reported. Drivers nearby will see it.')).toBeVisible();

  // The pin lands on both screens, where A was, and nobody is named on it.
  await expect
    .poll(async () => pageB.evaluate(() => window.__tw.reports().length), { timeout: 15_000 })
    .toBe(1);
  const pin = await pageB.evaluate(() => window.__tw.reports()[0]);
  expect(pin).toMatchObject({ kind: 'police', n: 1 });
  expect(pin?.distanceM).toBeGreaterThan(200);
  expect(pin?.distanceM).toBeLessThan(500);
  expect(JSON.stringify(pin)).not.toContain('by');

  // Said once, at the foot of the screen, with the distance.
  await expect(pageB.locator('.hud__banner--warm')).toContainText(/Police reported \d+ m away/, {
    timeout: 15_000,
  });

  // A second driver reporting the same thing confirms the pin rather than adding one.
  await pageB.getByRole('button', { name: 'Report', exact: true }).click();
  await pageB.getByRole('button', { name: /^Police/ }).click();
  await expect
    .poll(async () => pageA.evaluate(() => window.__tw.reports()[0]?.n), { timeout: 15_000 })
    .toBe(2);
  expect(await pageA.evaluate(() => window.__tw.reports().length)).toBe(1);

  await a.close();
  await b.close();
});

test('a spectator is told to turn location on rather than left guessing', async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await onboard(page, '/?e2e');
  // Refused, not merely unanswered: the app has to have settled on spectator mode first.
  await expect(page.getByText('Location is off.')).toBeVisible();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByRole('button', { name: /^Accident/ }).click();
  await expect(page.getByText('Turn yourself back on to report.')).toBeVisible();
  await context.close();
});
