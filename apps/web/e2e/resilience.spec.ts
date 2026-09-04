import { expect, test } from '@playwright/test';
import { GENEVA, onboard, simUrl } from './helpers';

/**
 * The honest failure modes. On the free plan, running out of budget is an outage until
 * midnight UTC, never a bill, so the app has to say so plainly rather than spin.
 */
test('says so plainly when the service is paused', async ({ page }) => {
  // The kill switch is a Worker variable (WS_ENABLED=false), which the client sees as a
  // refused socket plus a 503 from the probe.
  await page.routeWebSocket('**/ws**', (ws) => ws.close());
  await page.route('**/ws?hub=zz', (route) => route.fulfill({ status: 503, body: 'paused' }));

  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByText(/paused|over its free capacity/i)).toBeVisible({ timeout: 30_000 });
});

test('says when the day\'s free capacity is gone, rather than spinning', async ({ page }) => {
  await page.routeWebSocket('**/ws**', (ws) => ws.close());
  await page.route('**/ws?hub=zz', (route) => route.fulfill({ status: 429, body: 'over budget' }));

  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByText(/over its free capacity/i)).toBeVisible({ timeout: 30_000 });
});

test('recovers silently when the socket drops', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['geolocation'] });
  const page = await context.newPage();
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 40));

  // Offline, then back: no error screen, no lost identity, and the map keeps working.
  const id = await page.evaluate(() => window.__tw.identity()?.id);
  await context.setOffline(true);
  await page.waitForTimeout(3_000);
  await context.setOffline(false);

  await expect
    .poll(async () => page.evaluate(() => window.__tw.self() !== null), { timeout: 30_000 })
    .toBe(true);
  expect(await page.evaluate(() => window.__tw.identity()?.id)).toBe(id);
  await context.close();
});
