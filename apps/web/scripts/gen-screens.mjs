#!/usr/bin/env node
/**
 * The README screenshots: the car screen with traffic on it, and a phone with the wave.
 *
 *   pnpm gen:screens                    (from the repository root, worker running on :8787)
 *
 * Same reasoning as the demo clip (ADR-0038): these are the real client, the real hub and
 * the real protocol over a real socket, with only the GPS simulated, and they re-render on
 * demand because the car drawings change often enough that a hand-taken screenshot is stale
 * within a fortnight. Output goes to `docs/images/` and is committed; nothing here runs at
 * build time.
 *
 * It needs a machine that can reach tiles.openfreemap.org, and says so when it cannot,
 * because a screenshot of a black map is worse than no screenshot.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..', '..');
const out = join(root, 'docs', 'images');
mkdirSync(out, { recursive: true });

/** The same pre-installed Chromium the e2e suite prefers, rather than a second copy. */
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

/** Chromium ignores HTTPS_PROXY, so without this the map tiles fail behind one (see gen-demo). */
const proxyServer = process.env['HTTPS_PROXY'] ?? process.env['https_proxy'] ?? '';
const proxy = proxyServer
  ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost,::1' } }
  : {};
const proxyTls = proxyServer ? { ignoreHTTPSErrors: true } : {};
/**
 * A proxy that re-terminates TLS can reset the tunnel on Chromium's TLS 1.3 handshake, which
 * arrives as a bare connection reset on every tile and a black map in the picture. Capping
 * the handshake is scoped to the proxy case, and to this screenshot browser: nothing the app
 * ships or serves is affected.
 */
const proxyArgs = proxyServer ? { args: ['--ssl-version-max=tls1.2'] } : {};

const CAR = { width: 1920, height: 1200 };
const PHONE = { width: 440, height: 900 };

const BASE = process.env['SCREENS_BASE_URL'] ?? 'http://127.0.0.1:8787';
const GENEVA = { lat: 46.2044, lng: 6.1432 };

/**
 * The hero drives north; the neighbour comes the other way about 130 m off, which is inside
 * the 300 m that raises the wave button and close enough that the neighbour's own nearest
 * car is the hero rather than one of the simulated ones filling the rest of the map.
 */
const HERO = { nick: 'Sam', model: 'Model 3', colour: 'Deep Blue', lat: GENEVA.lat, heading: 0 };
const NEIGHBOUR = {
  nick: 'Robin',
  model: 'Model Y',
  colour: 'Pearl White',
  lat: GENEVA.lat + 0.0012,
  heading: 180,
};
const SPEED_KMH = 30;

const sim = (driver) =>
  `${BASE}/?e2e&sim=${driver.lat},${GENEVA.lng},${driver.heading},${SPEED_KMH}`;

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/whereami`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`no server at ${BASE}. Run pnpm dev:worker first.`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/** Pick a car, name it, go. Different paint per driver, so the two read apart. */
async function onboard(page, driver) {
  await page.goto(sim(driver));
  await page.getByRole('button', { name: driver.model, exact: true }).click();
  await page.getByRole('button', { name: driver.colour, exact: true }).click();
  await page.getByRole('textbox').fill(driver.nick);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
}

/** Simulated drivers, so the wide screen has a city on it rather than two cars (pnpm sim). */
function startTraffic() {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@teslawave/worker',
      'sim',
      '--',
      '--n',
      '14',
      '--center',
      `${GENEVA.lat},${GENEVA.lng}`,
      '--radius',
      '900',
      '--waves',
      '0',
    ],
    { cwd: root, stdio: 'ignore' },
  );
  child.on('error', () =>
    console.warn('WARNING: could not start pnpm sim; the map will be quiet.'),
  );
  return child;
}

const traffic = startTraffic();
await waitForServer();
const browser = await chromium.launch({ ...launch, ...proxy, ...proxyArgs });
let tilesFailed = false;

const open = async (viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: true,
    permissions: ['geolocation'],
    locale: 'en-US',
    ...proxyTls,
  });
  const page = await context.newPage();
  page.on('requestfailed', (r) => {
    if (r.url().includes('tiles.openfreemap.org')) tilesFailed = true;
  });
  return page;
};

const heroPage = await open(CAR);
const neighbourPage = await open(PHONE);

// The car picker is the first thing anybody sees, so it is worth a picture of its own.
await neighbourPage.goto(sim(NEIGHBOUR));
await neighbourPage.getByRole('button', { name: NEIGHBOUR.model, exact: true }).waitFor();
await neighbourPage.waitForTimeout(1_200);
await neighbourPage.screenshot({ path: join(out, 'choose.png') });

await Promise.all([onboard(heroPage, HERO), onboard(neighbourPage, NEIGHBOUR)]);

// Both screens must be readable, not merely connected: the header is a broadcast tick behind
// the car list, so waiting on cars() alone catches one screen still saying "Quiet road".
const ready = (page) =>
  page.waitForFunction(
    () => window.__tw.summary().online >= 2 && window.__tw.cars().length > 0,
    null,
    {
      timeout: 60_000,
    },
  );
await Promise.all([ready(heroPage), ready(neighbourPage)]);
// Let the tiles finish and the cars glide out of their first interpolation.
await heroPage.waitForTimeout(6_000);

// The phone, with the wave button up: what a driver in a dash mount is being shown.
const neighbourWave = neighbourPage.locator('.wave');
await neighbourWave.waitFor({ state: 'visible', timeout: 30_000 });
await neighbourPage.screenshot({ path: join(out, 'phone.png') });

// The neighbour waves, and the car screen catches the card landing. That is the product.
await neighbourWave.click();
const card = heroPage.locator('.wave-card');
const landed = await card
  .waitFor({ state: 'visible', timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
if (!landed) console.warn('WARNING: no wave card on the car screen; shooting the map alone.');
// The ripple across the screen is 900 ms and the card shows for 4 s: wait out the animation,
// so the picture is the card and the map rather than a frame of gold wash.
await heroPage.waitForTimeout(2_000);
// JPEG for this one only: a 1920x1200 PNG of a photographic map is close to a megabyte, and
// a README picture is not evidence of anything that a little compression destroys.
await heroPage.screenshot({ path: join(out, 'car-screen.jpg'), type: 'jpeg', quality: 92 });

await browser.close();
traffic.kill('SIGINT');

if (tilesFailed) {
  console.warn(
    'WARNING: the map tiles did not load, so these show a black map. Re-run somewhere with ' +
      'access to tiles.openfreemap.org before committing them.',
  );
}
console.log(`Wrote ${['choose.png', 'phone.png', 'car-screen.jpg'].join(', ')} to docs/images/`);
