import { expect, test } from '@playwright/test';
import { onboard, simUrl, GENEVA } from './helpers';

/**
 * A Content-Security-Policy that forgets one origin does not throw, does not fail a build and
 * does not fail any other test in this suite. It produces a map with no cars on it, or a car
 * screen with no map, and the first report comes from a driver.
 *
 * So the policy is tested the only way that means anything: run the real app behind the real
 * header and fail on the browser's own violation events.
 */

/** Everything the browser refused to load or run, as the browser itself reports it. */
type Violation = { directive: string; blocked: string };

test('the app runs a whole session without the policy blocking anything', async ({ page }) => {
  const violations: Violation[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: Violation[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { __csp: Violation[] }).__csp.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
  });
  // A worker gets its own policy and its own violation events, which never reach the page.
  // The console is where those surface, so both are collected.
  const consoleViolations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text()))
      consoleViolations.push(m.text());
  });
  // The one directive the policy cannot state directly. `connect-src 'self'` is specified to
  // cover wss:// against an https:// origin of the same host, and browsers have disagreed
  // about it. If this browser does not, the socket never opens and the map is empty — with no
  // error anywhere but here.
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));

  await onboard(page, simUrl(GENEVA.lat, GENEVA.lng));
  // Long enough for the map to build its style, spawn the worker, ask for tiles, open the
  // socket, and for the overlay to bake a sprite or two.
  await page.waitForTimeout(3_000);
  // Open a sheet, so the parts of the UI that only exist after a tap are exercised too.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(500);

  const reported = await page.evaluate(
    () => (window as unknown as { __csp: Violation[] }).__csp ?? [],
  );
  violations.push(...reported);

  expect(
    violations,
    `the policy blocked something the app needs:\n${violations
      .map((v) => `  ${v.directive} blocked ${v.blocked}`)
      .join('\n')}`,
  ).toHaveLength(0);
  expect(consoleViolations, consoleViolations.join('\n')).toHaveLength(0);

  expect(sockets.join(' '), 'connect-src must let the hub socket through').toContain('/ws?hub=');

  // And the app is actually alive, so a violation-free run cannot mean a blank page.
  const workers = page.workers().map((w) => w.url());
  expect(workers.join(' '), 'MapLibre should have started its worker').toContain('maplibre');
  expect(await page.evaluate(() => window.__twMap?.getStyle().layers.length ?? 0)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__tw.identity())).not.toBeNull();
});

test('the response carries the policy and the rest of the headers', async ({ request }) => {
  const res = await request.get('/');
  const headers = res.headers();
  const csp = headers['content-security-policy'] ?? '';
  expect(csp, 'no policy at all is the failure this test exists for').not.toBe('');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  // No inline script is the reason the policy is worth having: a driver's identity is one
  // secret in localStorage, so script on this origin is impersonation (ADR-0025).
  const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
  expect(scriptSrc).not.toContain('unsafe-inline');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
});
