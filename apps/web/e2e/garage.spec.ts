import { expect, test, type Page } from '@playwright/test';
import { cars, GENEVA, onboard, simUrl } from './helpers';

/**
 * Two connected drivers, well away from Geneva. Presence lingers on the hub for a minute
 * after a context closes, so a pair left in the cell the onboarding specs use makes their
 * "quiet road" assertions lie — the same trap the perf spec documents.
 */
const AWAY = { lat: 45.4642, lng: 9.19 };

const openGarage = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Change', exact: true }).click();
};

test('you can change your car after onboarding, and it sticks', async ({ page }) => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 50));
  expect(await page.evaluate(() => window.__tw.identity())).toMatchObject({
    model: '3',
    colour: 'pearl',
  });

  await openGarage(page);
  await page.getByRole('button', { name: 'Model Y', exact: true }).click();
  await page.getByRole('button', { name: 'Deep Blue', exact: true }).click();
  await page.getByRole('textbox').fill('Nine');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Your car is updated.')).toBeVisible();
  expect(await page.evaluate(() => window.__tw.identity())).toMatchObject({
    model: 'Y',
    colour: 'deepblue',
    nick: 'Nine',
  });

  // The identity itself must survive: changing your paint is not becoming a new driver.
  const id = await page.evaluate(() => window.__tw.identity()?.id);
  await page.reload();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  expect(await page.evaluate(() => window.__tw.identity())).toMatchObject({
    id,
    model: 'Y',
    colour: 'deepblue',
    nick: 'Nine',
  });
});

test('a name can be cleared again, not only changed', async ({ page }) => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng, 90, 50));
  await openGarage(page);
  await page.getByRole('textbox').fill('Nine');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate(() => window.__tw.identity())).toMatchObject({ nick: 'Nine' });

  await openGarage(page);
  await page.getByRole('textbox').fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Rebuilt rather than patched, or an emptied field would leave the old name in place.
  expect(await page.evaluate(() => window.__tw.identity())).not.toHaveProperty('nick');
});

test('the other driver sees the new car without anyone reconnecting', async ({ browser }) => {
  const watcher = await browser.newContext({ permissions: ['geolocation'] });
  const driver = await browser.newContext({ permissions: ['geolocation'] });
  const watching = await watcher.newPage();
  const driving = await driver.newPage();

  await onboard(watching, simUrl(AWAY.lat, AWAY.lng, 90, 50));
  await onboard(driving, simUrl(AWAY.lat + 0.0004, AWAY.lng + 0.0004, 270, 50));

  await expect
    .poll(async () => (await cars(watching)).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  const before = await watching.evaluate(() => window.__tw.cars()[0]?.id);

  await openGarage(driving);
  await driving.getByRole('button', { name: 'Cybertruck', exact: true }).click();
  await driving.getByRole('button', { name: 'Save', exact: true }).click();

  // Same driver, new car: if changing the profile tore the socket down, the id would change
  // and the watcher would see one car leave and another arrive.
  await expect
    .poll(
      async () =>
        watching.evaluate(() => {
          const car = window.__tw.cars()[0];
          return car ? `${car.id}` : null;
        }),
      { timeout: 15_000 },
    )
    .toBe(before);
});
