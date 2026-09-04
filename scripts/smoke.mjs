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
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
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
  for (const path of ['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs']) {
    const res = await fetch(`${base}${path}`);
    expect(res.ok, `${path} returned ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    expect(/javascript|ecmascript/.test(type), `${path} served as ${type}`);
    const body = await res.text();
    expect(!body.includes('<div id="root">'), `${path} is the app shell, not the module`);
  }
  return 'worker and shared chunk present';
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

await check('a real driver can connect and be welcomed', async () => {
  const url = `${base.replace(/^http/, 'ws')}/ws?hub=u0`;
  const ws = new WebSocket(url);
  const welcome = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome within 10 s')), 10_000);
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          t: 'hello',
          id: `smoke-${Math.random().toString(36).slice(2, 10)}`,
          model: '3',
          colour: 'red',
          cells: ['u0hq'],
          spectator: true,
        }),
      );
    });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.t === 'welcome') {
        clearTimeout(timer);
        resolve(msg);
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
    ['', `### Smoke test: ${base}`, '', '```', ...results.map((r) => `${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}  ${r.detail}`), '```', ''].join('\n'),
  );
}
if (failed > 0) {
  console.error(`\n${failed} check(s) failed against ${base}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed against ${base}`);
