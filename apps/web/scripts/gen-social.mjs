#!/usr/bin/env node
/**
 * The social image and the icons, drawn by the app itself.
 *
 *   pnpm gen:social            (from the repository root)
 *
 * The image a link unfurls into is the share card with the product's words on it, so it is
 * rendered by the same code that draws the card a driver sends (`/og`, development only),
 * and screenshotted. The icons are one SVG written out at the sizes phones ask for.
 *
 * Output goes to `public/` and is committed: nothing here runs at build time, so a build
 * machine without a browser or a network is not a build that fails.
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

/** The size every messenger and social preview expects (og:image:width/height in index.html). */
const OG = { width: 1200, height: 630 };

/**
 * The app's font stack is the system's, which on a car is fine and on a build machine can
 * be anything. Inter is close to what the car shows; it is fetched, embedded as data URIs
 * so the page needs no network, and given up on quietly if it cannot be fetched.
 */
async function interCss() {
  const headers = {
    'user-agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  };
  try {
    const css = await (
      await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@450;600&display=swap', {
        headers,
      })
    ).text();
    let embedded = '';
    for (const block of css.split('/* ')) {
      if (!block.startsWith('latin */')) continue;
      const face = block.slice(block.indexOf('@font-face'));
      const url = /url\((https:[^)]+)\)/.exec(face)?.[1];
      if (!url) continue;
      const bytes = Buffer.from(await (await fetch(url, { headers })).arrayBuffer());
      embedded += face.replace(url, `data:font/woff2;base64,${bytes.toString('base64')}`);
    }
    if (!embedded) throw new Error('no latin faces in the stylesheet');
    return embedded;
  } catch (error) {
    console.warn(`Inter is not available (${error.message}); the text will use the system font.`);
    return null;
  }
}

/**
 * The icon: three rings of the sonar sweep on the app's ground. `maskable` fills the whole
 * square and keeps the rings inside the safe zone, for launchers that cut their own shape.
 */
function iconSvg(maskable) {
  const rings = `
  <circle cx="32" cy="32" r="8" fill="none" stroke="#6ee7ff" stroke-width="3"/>
  <circle cx="32" cy="32" r="16" fill="none" stroke="#6ee7ff" stroke-width="2.5" opacity="0.6"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="#6ee7ff" stroke-width="2" opacity="0.28"/>`;
  return maskable
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#07090c"/>
  <g transform="translate(32 32) scale(0.8) translate(-32 -32)">${rings}
  </g>
</svg>
`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#07090c"/>${rings}
</svg>
`;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  // iOS rounds the corners itself, so it gets the full-bleed drawing.
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  server: { port: 0, host: '127.0.0.1' },
  logLevel: 'error',
});
await server.listen();
const { port } = server.httpServer.address();

// A machine that has a Chromium but not the one this Playwright release pins can name it.
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({
    viewport: { width: OG.width + 96, height: OG.height + 96 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => {
    throw error;
  });
  const font = await interCss();
  await page.goto(`http://127.0.0.1:${port}/og${font ? '?font=Inter' : ''}`);
  const canvas = page.locator('canvas[data-og]');
  await canvas.waitFor();
  if (font) {
    await page.addStyleTag({ content: font });
    await page.evaluate(() =>
      Promise.all([document.fonts.load('600 58px Inter'), document.fonts.load('450 22px Inter')]),
    );
    // The board redraws on `loadingdone`; make sure that has happened before shooting.
    await page.waitForFunction(
      () => Number(document.querySelector('canvas[data-og]')?.dataset.drawn) >= 2,
    );
  }
  // Drawn at twice the card's size, shown at the social size: crisp, and exactly the
  // dimensions the meta tags promise.
  await canvas.evaluate((el, og) => {
    el.style.width = `${og.width}px`;
    el.style.height = `${og.height}px`;
  }, OG);
  await canvas.screenshot({ path: join(out, 'og.png'), type: 'png' });
  console.log('wrote og.png');

  writeFileSync(join(out, 'icon.svg'), iconSvg(false));
  console.log('wrote icon.svg');
  for (const { file, size, maskable } of ICONS) {
    await page.setContent(
      `<body style="margin:0;background:transparent"><img id="i" width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(iconSvg(maskable)).toString('base64')}"></body>`,
    );
    await page.locator('#i').screenshot({ path: join(out, file), omitBackground: true });
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
  await server.close();
}
