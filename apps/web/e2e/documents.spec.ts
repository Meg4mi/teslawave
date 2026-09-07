import { expect, test } from '@playwright/test';
import { GENEVA, open, simUrl } from './helpers';

/**
 * The two documents a stranger reads before they trust the app (ADR-0037). They are worth a
 * real browser rather than a unit test for one reason: a page whose route was never registered
 * still renders, because an unknown path falls through to the app and answers 200. The
 * catalogue shape test cannot see that, and neither can a crawler until it is too late.
 */

test('the terms open, lead with driving, and name somewhere to write', async ({ page }) => {
  await open(page, '/terms');
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();

  // Driving is the first section on purpose: it is the only one that can prevent harm.
  const sections = await page.getByRole('heading', { level: 2 }).allTextContents();
  expect(sections[0]).toBe('Driving');
  expect(sections).toContain('Liability');

  await expect(page.getByText(/law wins over anything written here/)).toBeVisible();
  await expect(page.getByText(/contact@teslawave\.app/)).toBeVisible();
  // Required on every screen, this one included (brief 1). Located by its own element: the
  // Independence section says something similar, and a substring match would find either.
  await expect(page.locator('p.disclaimer')).toHaveText(
    /Independent project\. Not affiliated with, endorsed or sponsored by Tesla, Inc\./,
  );
});

test('privacy names who is answerable and links the terms', async ({ page }) => {
  await open(page, '/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByText(/independent project rather than a company/)).toBeVisible();
  await expect(page.getByText(/contact@teslawave\.app/)).toBeVisible();
  await expect(page.getByText(/data protection authority/)).toBeVisible();

  await page.getByRole('link', { name: /terms this is offered under/i }).click();
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
});

test('the first screen says the road comes first, and both documents are one tap away', async ({
  page,
}) => {
  await open(page, simUrl(GENEVA.lat, GENEVA.lng));
  // Beside the privacy promise, above Go: the moment the driver agrees to be seen.
  await expect(page.getByText(/The road comes first/)).toBeVisible();

  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
});

test('a French driver gets French terms, not English ones', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR', permissions: ['geolocation'] });
  const page = await context.newPage();
  await open(page, '/terms?lang=fr');
  await expect(page.getByRole('heading', { name: 'Conditions', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Au volant', level: 2 })).toBeVisible();
  await expect(page.getByText(/Un salut vaut un coup d’œil/)).toBeVisible();
  await context.close();
});

test('a crawler finds both documents in the shell, before any bundle runs', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/privacy</loc>');
  expect(sitemap).toContain('/terms</loc>');
});
