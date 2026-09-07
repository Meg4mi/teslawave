#!/usr/bin/env node
/**
 * Post-deploy verification against the live URL. A green deploy is not evidence that
 * anything works: this opens a real WebSocket to a real Durable Object and says hello.
 *
 *   SMOKE_URL=https://teslawave.example.workers.dev node scripts/smoke.mjs
 */
const base = (process.env.SMOKE_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('SMOKE_URL is required.');
  process.exit(2);
}

/**
 * A brand new workers.dev route takes a moment to propagate, and the first deploy runs this
 * within a second of `wrangler deploy` returning. A 404 there means "not yet", not "broken",
 * so wait for the deployment to answer before judging it.
 */
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? 120_000);
const waitUntilReachable = async () => {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/whereami`);
      if (res.ok) return;
      last = `status ${res.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  console.error(`${base} never became reachable within ${READY_TIMEOUT_MS / 1000} s (${last}).`);
  process.exit(1);
};

await waitUntilReachable();

const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

await check('the app shell is served', async () => {
  const res = await fetch(base, { headers: { 'user-agent': 'teslawave-smoke' } });
  expect(res.ok, `GET / returned ${res.status}`);
  const html = await res.text();
  expect(html.includes('Wave at other Teslas'), 'the page title is missing');
  expect(html.includes('<div id="root">'), 'the app root is missing');
  return `${res.status}, ${html.length} bytes`;
});

await check('an unknown path falls back to the app (SPA routing)', async () => {
  const res = await fetch(`${base}/privacy`);
  expect(res.ok, `GET /privacy returned ${res.status}`);
  return String(res.status);
});

await check('the MapLibre worker is served as JavaScript', async () => {
  // Served as index.html by the SPA fallback once already, which renders the map blank while
  // everything else looks healthy. Never again without this failing loudly.
  //
  // A new asset path can lag behind the API by a few seconds after a deploy, and /api answers
  // from the previous version in the meantime, so the readiness wait cannot see it. Retry for
  // a bounded window: slow propagation should not be a red build, but a missing file still is.
  const deadline = Date.now() + 90_000;
  let last = '';
  for (;;) {
    const results = await Promise.all(
      ['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs'].map(async (path) => {
        const res = await fetch(`${base}${path}`);
        const type = res.headers.get('content-type') ?? '';
        const body = await res.text();
        if (!res.ok) return `${path} returned ${res.status}`;
        if (!/javascript|ecmascript/.test(type)) return `${path} served as ${type}`;
        if (body.includes('<div id="root">')) return `${path} is the app shell, not the module`;
        return null;
      }),
    );
    const problem = results.find((r) => r !== null);
    if (!problem) return 'worker and shared chunk present';
    last = problem;
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(last);
});

await check('/api/whereami answers', async () => {
  const res = await fetch(`${base}/api/whereami`);
  expect(res.ok, `returned ${res.status}`);
  const body = await res.json();
  expect('lat' in body, 'no lat field');
  return JSON.stringify(body);
});

await check('/api/stats answers', async () => {
  const res = await fetch(`${base}/api/stats`);
  expect(res.ok, `returned ${res.status}`);
  const body = await res.json();
  expect(typeof body.total === 'number', 'no total');
  return `total ${body.total}`;
});

await check('a bad hub id is refused at the edge', async () => {
  const res = await fetch(`${base}/ws?hub=not-a-hub`);
  expect(res.status === 400, `expected 400, got ${res.status}`);
  return '400';
});

await check('a valid hub without an upgrade is refused politely', async () => {
  const res = await fetch(`${base}/ws?hub=u0`);
  expect(res.status === 426, `expected 426, got ${res.status}`);
  return '426';
});

/**
 * The wire version the client is built against, read from the protocol source rather than
 * copied here: a smoke test that speaks a stale version would be told to upgrade instead of
 * being welcomed, and would fail a deploy that is actually fine.
 */
const protocolVersion = async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../packages/protocol/src/constants.ts', import.meta.url),
    'utf8',
  );
  const match = /export const PROTOCOL_VERSION = (\d+)/.exec(source);
  return match ? Number(match[1]) : undefined;
};

await check('a real driver can connect and be welcomed', async () => {
  const url = `${base.replace(/^http/, 'ws')}/ws?hub=u0`;
  const v = await protocolVersion();
  const ws = new WebSocket(url);
  const welcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome within 10 s')), 10_000);
    ws.addEventListener('open', () => {
      // A hello carries the driver's secret, never an id: the hub derives the id by hashing
      // it (ADR-0025). Anything else is answered with an error, not a welcome.
      ws.send(
        JSON.stringify({
          t: 'hello',
          secret: `smoke-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
          model: '3',
          colour: 'red',
          cells: ['u0hq'],
          spectator: true,
          ...(v === undefined ? {} : { v }),
        }),
      );
    });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.t === 'welcome') {
        clearTimeout(timer);
        resolve(msg);
      } else if (msg.t === 'error') {
        // Say what the hub said, rather than waiting ten seconds to say nothing.
        clearTimeout(timer);
        reject(new Error(`hub refused the hello: ${msg.code}`));
      } else if (msg.t === 'upgrade') {
        clearTimeout(timer);
        reject(new Error(`hub speaks protocol ${msg.v}, the smoke test sent ${v ?? 'none'}`));
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('socket error'));
    });
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      reject(new Error(`socket closed: ${event.code}`));
    });
  });
  ws.close();
  const skew = Math.abs(welcome.now - Date.now());
  expect(skew < 60_000, `server clock is ${Math.round(skew / 1000)} s away from ours`);
  return `welcome, clock skew ${skew} ms`;
});

const width = Math.max(...results.map((r) => r.name.length));
for (const { name, ok, detail } of results)
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(width)}  ${detail}`);

const failed = results.filter((r) => !r.ok).length;
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '',
      `### Smoke test: ${base}`,
      '',
      '```',
      ...results.map((r) => `${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}  ${r.detail}`),
      '```',
      '',
    ].join('\n'),
  );
}
if (failed > 0) {
  console.error(`\n${failed} check(s) failed against ${base}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed against ${base}`);
