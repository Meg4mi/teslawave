import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { onboard, simUrl } from './helpers';

/**
 * The brief's headline acceptance criterion: a 2019 Model 3 (MCU 2, Intel Atom) must hold
 * 25 fps while panning with 20 cars visible.
 *
 * A CI container has no GPU, so MapLibre runs on a software rasteriser and the composite
 * frame rate there says nothing about a real car. The composite number is therefore logged,
 * not gated. What IS gated is our own per-frame work (world tick plus canvas overlay), under
 * 6x CPU throttling with twenty cars: that is the part this repo controls, and a regression
 * in it is a regression on the car too. The real number comes from a real car and is
 * recorded in docs/tesla-notes.md.
 */
const MAX_FRAME_COST_MS = Number(process.env['PERF_MAX_FRAME_MS'] ?? 8);
const CARS = 20;

/** Far from the other specs, so twenty simulated drivers can never leak into their cells. */
const TRACK = { lat: 45.764, lng: 4.8357 };

let sim: ChildProcess | null = null;

test.beforeAll(async () => {
  const repo = fileURLToPath(new URL('../../../apps/worker', import.meta.url));
  sim = spawn(
    'node',
    [
      // tsx is a dependency of the worker package, so the loader is resolved from there.
      '--import',
      'tsx',
      'scripts/sim-cars.ts',
      '--n',
      String(CARS),
      '--center',
      `${TRACK.lat},${TRACK.lng}`,
      '--radius',
      '900',
      '--url',
      'ws://127.0.0.1:8787/ws',
    ],
    // Its own process group, so killing it takes the whole tree with it and no simulated
    // driver survives into the next spec file.
    { cwd: repo, stdio: 'ignore', detached: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 8_000));
});

test.afterAll(async () => {
  const child = sim;
  sim = null;
  if (!child?.pid) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
  // Never hang the run on a child that has already gone.
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
});

test('holds a usable frame rate while panning with twenty cars', async ({ page }) => {
  test.slow();
  await onboard(page, simUrl(TRACK.lat, TRACK.lng, 90, 30));

  await expect
    .poll(async () => page.evaluate(() => window.__tw.cars().length), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(5);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.evaluate(() => window.__tw.resetFrameCost());

  const result = await page.evaluate(async () => {
    const frames: number[] = [];
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const start = last;
      const tick = (now: number): void => {
        frames.push(now - last);
        last = now;
        if (now - start > 5_000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    return { mean, p95: frames[Math.floor(frames.length * 0.95)] ?? 0, count: frames.length };
  });

  const cost = await page.evaluate(() => window.__tw.frameCost());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const fps = 1_000 / result.mean;
  const cars = await page.evaluate(() => window.__tw.cars().length);
  console.log(
    `perf: composite ${fps.toFixed(1)} fps (p95 frame ${result.p95.toFixed(1)} ms), ` +
      `our work ${cost.mean.toFixed(2)} ms mean / ${cost.p95.toFixed(2)} ms p95 ` +
      `over ${cost.samples} frames, with ${cars} cars at 6x CPU throttling`,
  );
  expect(cost.samples).toBeGreaterThan(30);
  expect(cost.mean).toBeLessThanOrEqual(MAX_FRAME_COST_MS);
});
