import { expect, test } from '@playwright/test';

/**
 * MapLibre's worker is requested at a URL no bundler can follow statically, so it went
 * missing from the build and the SPA fallback answered with index.html. The map rendered
 * nothing while every other check in this suite passed.
 *
 * This asserts the shape of the response rather than the behaviour of the map, so it works
 * without any network access to a tile host and cannot quietly pass.
 */
const MODULES = ['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs'];

test('MapLibre worker modules are served as JavaScript, not as the app shell', async ({
  request,
}) => {
  for (const path of MODULES) {
    const res = await request.get(path);
    expect(res.status(), `${path} should exist`).toBe(200);
    expect(res.headers()['content-type'] ?? '', `${path} content type`).toMatch(
      /javascript|ecmascript/,
    );
    const body = await res.text();
    expect(body, `${path} must not be the SPA fallback`).not.toContain('<div id="root">');
    expect(body, `${path} should be the MapLibre module`).toContain('MapLibre GL JS');
  }
});

test('the worker starts and the map gets past style creation', async ({ page }) => {
  const failures: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && /worker|Worker/.test(text)) failures.push(text);
  });
  await page.goto('/?e2e&sim=46.2044,6.1432,90,50');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.waitForFunction(() => typeof window.__tw !== 'undefined');
  await page.waitForTimeout(2_500);
  // No tile host is reachable from every CI sandbox, so this asserts the parts that do not
  // depend on one: a worker actually spawned, and the style has layers.
  const workers = page.workers().map((w) => w.url());
  expect(workers.join(' '), 'MapLibre should have started its worker').toContain('maplibre');
  const layers = await page.evaluate(() => window.__twMap?.getStyle().layers.length ?? 0);
  expect(layers).toBeGreaterThan(5);
  expect(failures, failures.join('\n')).toHaveLength(0);
});
