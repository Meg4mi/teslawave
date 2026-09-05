import { expect, test } from '@playwright/test';
import { GENEVA, onboard, open, simUrl } from './helpers';

/**
 * Language is detected, never asked for. These check the three ways it can be decided — the
 * car's own browser, a link, and the settings sheet — and that a choice survives the drive.
 *
 * The project-wide locale is pinned to en-US (playwright.config.ts), so the French cases here
 * override it per context rather than relying on the machine's language.
 */

test('a French car screen arrives in French, with no question asked', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR', permissions: ['geolocation'] });
  const page = await context.newPage();
  await open(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeVisible();
  await expect(page.getByText('Saluez les autres Tesla')).toBeVisible();
  // The disclaimer is required on every screen, in whatever language the screen is in.
  await expect(page.getByText(/Sans affiliation avec Tesla, Inc./)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await context.close();
});

test('a region we do not speak falls back to English rather than to nothing', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'de-DE', permissions: ['geolocation'] });
  const page = await context.newPage();
  await open(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await context.close();
});

test('a ?lang= link lands in that language and is remembered afterwards', async ({ page }) => {
  await open(page, `${simUrl(GENEVA.lat, GENEVA.lng)}&lang=fr`);
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeVisible();

  // Following the link was a choice: a plain visit afterwards stays in French.
  await open(page, simUrl(GENEVA.lat, GENEVA.lng));
  await expect(page.getByRole('button', { name: 'Démarrer', exact: true })).toBeVisible();
});

test('the switcher changes the language everywhere, and it survives a reload', async ({ page }) => {
  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();

  await settings.getByRole('button', { name: 'Français', exact: true }).click();
  // The sheet it was opened from is itself retitled: nothing is left behind in English.
  await expect(page.getByRole('dialog', { name: 'Réglages' })).toBeVisible();
  await expect(page.getByText('Visible par les autres')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');

  await page.reload();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Réglages' })).toBeVisible();

  // And back again, from the same row.
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});
