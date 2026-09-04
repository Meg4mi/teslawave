import { expect, test, type Page } from '@playwright/test';
import { GENEVA, simUrl } from './helpers';

/**
 * Nothing may spill past the edge of the screen, on any screen, at any size this suite
 * runs at. A phone in a dash mount is the case that finds it: a segmented control one label
 * too wide, a toast that does not wrap, a sheet wider than the viewport. Each is a
 * horizontal scrollbar the driver can never see the end of.
 */
const spills = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const out = new Set<string>();
    const doc = document.scrollingElement;
    if (doc && doc.scrollWidth > vw + 1) out.add(`document scrolls sideways: ${doc.scrollWidth} > ${vw}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      // The map canvas is deliberately oversized by MapLibre; its controls are its own.
      if (el.closest('.map__gl, .maplibregl-ctrl')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || el.hidden) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const name = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}`;
      if (rect.right > vw + 1 || rect.left < -1)
        out.add(`${name} spans ${Math.round(rect.left)}..${Math.round(rect.right)} in a ${vw} px viewport`);
      // Content wider than its box, in anything that is not meant to scroll sideways.
      const clips = ['auto', 'scroll', 'hidden'].includes(style.overflowX) || style.overflow === 'hidden';
      if (!clips && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && el.matches('.sheet *, .onboarding *, .hud *, .wave *, .toast *'))
        out.add(`${name} content is ${el.scrollWidth} px in a ${el.clientWidth} px box`);
    }
    return Array.from(out);
  });

const clean = async (page: Page, screen: string): Promise<void> => {
  await page.waitForTimeout(500);
  expect(await spills(page), `${screen} spills past the screen edge`).toEqual([]);
};

/** Close the open sheet and wait for its scrim to go, so the next tap lands on the map. */
const close = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.scrim')).toHaveCount(0);
};

test('no screen spills past the edge of the viewport', async ({ page }) => {
  await page.goto(simUrl(GENEVA.lat, GENEVA.lng));
  await clean(page, 'onboarding');

  // The longest model name, and the longest name a driver can type.
  await page.getByRole('button', { name: 'Cybertruck', exact: true }).click();
  await page.getByRole('textbox').fill('WWWWWWWWWWWWWWWWWWWWWWWW');
  await clean(page, 'onboarding with a long name');

  await page.getByRole('button', { name: 'How waving works' }).first().click();
  await clean(page, 'how to wave');
  await close(page, 'Got it');

  await page.getByRole('button', { name: 'I already set this up on my phone' }).click();
  await clean(page, 'code entry');
  await close(page, 'Close');

  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  await clean(page, 'map');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await clean(page, 'settings');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await clean(page, 'garage');
  await close(page, 'Cancel');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Use this on my car', exact: true }).click();
  await expect(page.locator('.pair__code')).toBeVisible();
  await clean(page, 'pairing code');
  await close(page, 'Close');

  await page.locator('.hud__stats').click();
  await clean(page, 'around you');
});
