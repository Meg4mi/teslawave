import { expect, test } from '@playwright/test';
import { GENEVA, onboard, simUrl } from './helpers';

test('onboarding reaches the map, and the identity survives a reload', async ({ page }) => {
  const started = Date.now();
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.locator('canvas').first()).toBeVisible();
  // The brief asks for map in under 20 s from a cold open.
  expect(Date.now() - started).toBeLessThan(20_000);

  const id = await page.evaluate(() => window.__tw.identity()?.id);
  expect(id).toBeTruthy();

  await page.reload();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  // No onboarding sheet the second time.
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__tw.identity()?.id)).toBe(id);
});

test('the disclaimer is on screen before and after onboarding', async ({ page }) => {
  await page.goto(simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByText(/Not affiliated with, endorsed or sponsored by Tesla/)).toBeVisible();
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByText(/Not affiliated with, endorsed or sponsored by Tesla/)).toBeVisible();
});

test('every touch target is big enough and clear of the screen edges', async ({ page }, info) => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  // The brief's margins are for the car screen; a phone in a mount has its own.
  const edge = info.project.name === 'phone' ? 20 : 40;

  const targets = page.locator('[data-touch]:visible');
  const count = await targets.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox();
    if (!box) continue;
    const label = (await targets.nth(i).getAttribute('aria-label')) ?? (await targets.nth(i).innerText());
    expect(Math.min(box.width, box.height), `${label} is too small to hit while driving`)
      .toBeGreaterThanOrEqual(44);
    expect(box.x, `${label} is too close to the left edge`).toBeGreaterThanOrEqual(edge - 1);
    expect(box.y, `${label} is too close to the top edge`).toBeGreaterThanOrEqual(edge - 1);
    expect(box.x + box.width, `${label} is too close to the right edge`).toBeLessThanOrEqual(
      viewport!.width - edge + 1,
    );
    expect(box.y + box.height, `${label} is too close to the bottom edge`).toBeLessThanOrEqual(
      viewport!.height - edge + 1,
    );
  }
});

test('a driver who refuses location becomes a spectator instead of a dead end', async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await page.goto('/?e2e');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByText(/You can see others, they cannot see you/)).toBeVisible({
    timeout: 20_000,
  });
  await context.close();
});

test('a driver alone on the road can still find out how to wave', async ({ page }) => {
  // The whole product is one gesture, and on an empty road there is nobody to demonstrate it.
  await page.goto(simUrl(GENEVA.lat, GENEVA.lng));
  await page.getByRole('button', { name: 'How waving works' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'How waving works' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('a big Wave button appears');
  await expect(sheet.locator('canvas')).toBeVisible();
  await sheet.getByRole('button', { name: 'Try it' }).click();
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet).toHaveCount(0);

  // And again from the map, where the empty state offers it.
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  await page.getByRole('button', { name: 'How waving works' }).first().click();
  await expect(page.getByRole('dialog', { name: 'How waving works' })).toBeVisible();
});
