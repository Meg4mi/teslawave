#!/usr/bin/env node
/**
 * The demo clip: two drivers crossing, and the wave landing on both screens.
 *
 *   pnpm gen:demo                       (from the repository root)
 *   pnpm gen:demo -- --car              the car screen instead of two phones
 *   pnpm gen:demo -- --keep             keep the two raw halves beside the joined clip
 *
 * Why this exists rather than a film of two real cars: until there are strangers to cross,
 * any real clip is two of our own devices staged to look organic, which is less honest than
 * a screen recording that says what it is. This one is the real app — the real client, the
 * real hub, the real protocol over a real socket — with only the GPS simulated (ADR-0038).
 *
 * It re-renders, which is the other half of the point. The car drawings changed in five of
 * the last sixteen commits, and a filmed clip is stale the moment they do.
 *
 * Output goes to `public/demo/` and is committed, like `gen:social`: nothing here runs at
 * build time, so a build machine without a browser is not a build that fails.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'demo');
const raw = join(out, '.raw');

const args = new Set(process.argv.slice(2));
const onCar = args.has('--car');
const keepHalves = args.has('--keep');

/** The same pre-installed Chromium the e2e suite prefers, rather than a second copy. */
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {};

/**
 * Chromium ignores HTTPS_PROXY, so on a machine that reaches the internet through one the
 * map tiles fail and the clip records a black rectangle. Node's fetch had already succeeded,
 * which is what made this look like a closed sandbox rather than an unconfigured browser.
 *
 * The local worker has to bypass it, and a proxy that terminates TLS presents its own
 * certificate — trusted here only because we are the ones who configured the proxy. Both are
 * scoped to the case where a proxy is actually set, so a normal machine is unaffected.
 */
const proxyServer = process.env['HTTPS_PROXY'] ?? process.env['https_proxy'] ?? '';
const proxy = proxyServer
  ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost,::1' } }
  : {};
const proxyTls = proxyServer ? { ignoreHTTPSErrors: true } : {};

/**
 * A phone in a dash mount is what a driver is shown in outreach, and two of them side by
 * side fit a landscape frame. `--car` renders the 1920x1200 screen instead, for a post whose
 * point is that this runs in the car itself.
 */
const SCREEN = onCar ? { width: 1920, height: 1200 } : { width: 440, height: 900 };

const BASE = process.env['DEMO_BASE_URL'] ?? 'http://127.0.0.1:8787';
const GENEVA = { lat: 46.2044, lng: 6.1432 };

/**
 * Two cars closing head-on, starting about 350 m apart at 25 km/h.
 *
 * The separation is the whole composition. At the zoom the app follows at, a metre is about
 * 0.42 px, so the 30 m this started with drew both cars inside one sprite: the clip showed a
 * single car and a button. 350 m is roughly 150 px apart — two cars, plainly — and it is
 * just outside the 300 m that raises the Wave button, so the clip opens on the approach and
 * the button arrives on camera a few seconds in. That is the story, and it cannot be told
 * from a standing start.
 */
const SPEED_KMH = 25;
const DRIVERS = [
  { name: 'A', nick: 'Robin', model: 'Model 3', colour: 'Red', lat: GENEVA.lat, heading: 0 },
  {
    name: 'B',
    nick: 'Sam',
    model: 'Model Y',
    colour: 'Pearl White',
    lat: GENEVA.lat + 0.0032,
    heading: 180,
  },
];

const sim = (lat, heading) => `${BASE}/?e2e&sim=${lat},${GENEVA.lng},${heading},${SPEED_KMH}`;

/** Wait for the worker to answer, so a cold `wrangler dev` is waited on rather than raced. */
async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/whereami`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`no server at ${BASE} after ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/** Pick a car on the first screen, then Go. Different paint per driver, so they read apart. */
async function onboard(page, driver) {
  await page.goto(sim(driver.lat, driver.heading));
  await page.getByRole('button', { name: driver.model, exact: true }).click();
  await page.getByRole('button', { name: driver.colour, exact: true }).click();
  await page.getByRole('textbox').fill(driver.nick);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
}

async function run() {
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });

  await waitForServer();
  const browser = await chromium.launch({ ...launch, ...proxy });

  // A machine that cannot reach the tile host still produces a clip, and the clip is a black
  // rectangle with two cars on it. That is worth saying out loud rather than discovering on
  // the way to a post.
  let tilesFailed = false;

  // Recording starts when the context does, so the clip's first seconds are two browsers
  // booting and finding each other — one half of the frame saying "Quiet road. Nobody else
  // out here right now" while the other has already connected. The offset from here to the
  // moment both screens agree is trimmed off the front below.
  const recordingStart = Date.now();
  const contexts = [];
  const pages = [];
  for (const driver of DRIVERS) {
    const context = await browser.newContext({
      viewport: SCREEN,
      deviceScaleFactor: 1,
      hasTouch: true,
      permissions: ['geolocation'],
      locale: 'en-US',
      ...proxyTls,
      recordVideo: { dir: join(raw, driver.name), size: SCREEN },
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on('requestfailed', (request) => {
      if (request.url().includes('tiles.openfreemap.org')) tilesFailed = true;
    });
    pages.push(page);
  }
  const [pageA, pageB] = pages;

  // Onboard together, so both clips start on the same beat.
  await Promise.all(DRIVERS.map((driver, i) => onboard(pages[i], driver)));

  // Let the map settle and the other car appear: this is the "approach" the clip opens on.
  // Both halves must be *readable*, not merely connected: the header is a broadcast tick
  // behind the car list, so trimming on cars() alone opened the clip on one screen still
  // saying "Quiet road. Nobody else out here right now" while the other had the button up.
  const bothSeeEachOther = (page) =>
    page.waitForFunction(
      () => window.__tw.summary().online >= 2 && window.__tw.cars().length > 0,
      null,
      {
        timeout: 40_000,
      },
    );
  await Promise.all([bothSeeEachOther(pageA), bothSeeEachOther(pageB)]);
  // A second of lead-in, so the clip opens on the approach rather than on a jump cut.
  const trimSeconds = Math.max(0, (Date.now() - recordingStart) / 1_000 - 1);

  // A waves. This is the moment the whole product is.
  const wave = pageA.locator('.wave');
  await wave.waitFor({ state: 'visible', timeout: 30_000 });
  await pageA.waitForTimeout(1_200);
  await wave.click();

  // It lands on B, who gets a few beats to read it before waving back.
  await pageB.locator('.wave-card').waitFor({ state: 'visible', timeout: 20_000 });
  await pageB.waitForTimeout(2_200);
  const back = pageB.locator('.wave.wave--back');
  if (await back.isVisible()) await back.click();

  // Hold on the aftermath: the counters, and the pulse line saying a wave just happened.
  await pageA.waitForTimeout(5_000);

  if (tilesFailed) {
    console.warn(
      'WARNING: the map tiles did not load, so the clip shows a black map. Re-run somewhere ' +
        'with access to tiles.openfreemap.org before posting it anywhere.',
    );
  }

  const videos = await Promise.all(pages.map((page) => page.video()?.path()));
  for (const context of contexts) await context.close();
  await browser.close();

  const halves = [];
  for (const [i, driver] of DRIVERS.entries()) {
    if (!videos[i]) continue;
    const dest = join(out, `demo-${driver.name.toLowerCase()}.webm`);
    renameSync(videos[i], dest);
    halves.push(dest);
  }
  return { halves, trimSeconds };
}

/** Join the two halves into one frame, if ffmpeg is here. Without it, the halves are the output. */
function join2(halves, trimSeconds) {
  return new Promise((resolve) => {
    if (halves.length !== 2) return resolve(null);
    const dest = join(out, onCar ? 'demo-car.mp4' : 'demo.mp4');
    const gap = 24;
    const trim = trimSeconds > 0 ? `trim=start=${trimSeconds.toFixed(2)},setpts=PTS-STARTPTS,` : '';
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-i',
        halves[0],
        '-i',
        halves[1],
        '-filter_complex',
        // Trimmed inside the graph rather than with `-ss` before `-i`: input seeking lands on
        // the nearest preceding keyframe, and Playwright's webm keyframes are far enough apart
        // that it gave back the seconds this is meant to cut. `trim` is frame-accurate.
        //
        // Then two screens on the app's own ground with a gutter between them, and an even
        // width because H.264 will not encode an odd one.
        `[0:v]${trim}pad=iw+${gap}:ih:0:0:color=0x0e1319[l];` +
          `[1:v]${trim}null[r];` +
          `[l][r]hstack=inputs=2,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=0x0e1319[v]`,
        '-map',
        '[v]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '20',
        '-movflags',
        '+faststart',
        dest,
      ],
      { stdio: 'ignore' },
    );
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? dest : null));
  });
}

const { halves, trimSeconds } = await run();
const joined = await join2(halves, trimSeconds);

if (joined) {
  console.log(`Wrote ${joined}`);
  if (!keepHalves) for (const half of halves) rmSync(half, { force: true });
  else console.log(`Kept the halves: ${halves.join(', ')}`);
} else {
  console.log(`Wrote ${halves.join(', ')}`);
  console.log('ffmpeg is not on PATH, so the two screens were not joined into one frame.');
}
rmSync(raw, { recursive: true, force: true });
console.log(
  'This is a screen recording of the real app with simulated GPS. Say so wherever it is posted.',
);
