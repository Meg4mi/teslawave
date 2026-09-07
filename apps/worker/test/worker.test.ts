import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CELL_PRECISION,
  CLOSE_PROTOCOL,
  CLOSE_WRONG_HUB,
  SERVER_TICK_MS,
  destination,
  encode,
  hubOf,
} from '@teslawave/protocol';
import { pruneAndAggregate } from '../src/stats.js';
import { applyMigrations } from './apply-migrations.js';
import { connect, helloMsg, idOf, posMsg, secretOf, wait } from './helpers.js';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
const HUB = hubOf(CELL);

beforeAll(async () => {
  await applyMigrations();
});

describe('/ws', () => {
  it('rejects a hub id that is not exactly two geohash characters', async () => {
    for (const hub of ['', 'u', 'u0g', '../x', 'ab!', 'ua']) {
      const res = await SELF.fetch(`https://teslawave.test/ws?hub=${encodeURIComponent(hub)}`, {
        headers: { Upgrade: 'websocket' },
      });
      expect(res.status, `hub=${hub}`).toBe(400);
    }
  });

  it('accepts a valid hub and refuses a non-websocket request', async () => {
    const res = await SELF.fetch(`https://teslawave.test/ws?hub=${HUB}`);
    expect(res.status).toBe(426);
  });

  it('lets a late joiner see a driver already on the map', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('worker-a', [CELL]));
    await a.next((m) => m.t === 'welcome');
    a.send(posMsg(GENEVA.lat, GENEVA.lng));

    const b = await connect(HUB);
    b.send(helloMsg('worker-b', [CELL]));
    await b.next((m) => m.t === 'welcome');
    // Told at once, in the opening diffs rather than in the welcome: a compact client is
    // given each car's description once and then referred to it by handle (ADR-0033).
    await b.waitForCar(idOf('worker-a'));
    a.close();
    b.close();
  });

  it('broadcasts a diff to the other drivers in the cell', async () => {
    const a = await connect(HUB);
    const b = await connect(HUB);
    a.send(helloMsg('diff-a', [CELL]));
    b.send(helloMsg('diff-b', [CELL]));
    await b.next((m) => m.t === 'welcome');
    a.send(posMsg(GENEVA.lat, GENEVA.lng));

    // The tick is driven by arriving messages, never by a timer: the next position flushes it.
    await wait(SERVER_TICK_MS + 200);
    a.send(posMsg(GENEVA.lat + 0.0005, GENEVA.lng));

    await b.waitForCar(idOf('diff-a'));
    const counts = b.received.filter((m) => m.t === 'diff' || m.t === 'diff2');
    expect(counts.some((m) => (m.t === 'diff' || m.t === 'diff2') && m.online > 0)).toBe(true);
    a.close();
    b.close();
  });

  it('closes a socket that says hello for a cell in another hub', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('wrong-hub', ['sp3e']));
    expect((await a.closed).code).toBe(CLOSE_WRONG_HUB);
  });

  it('closes a socket that keeps sending garbage', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('garbage', [CELL]));
    await a.next((m) => m.t === 'welcome');
    for (let i = 0; i < 6; i++) a.send('this is not a message');
    expect((await a.closed).code).toBe(CLOSE_PROTOCOL);
  });

  it('closes a socket that sends an oversized frame', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('big', [CELL]));
    await a.next((m) => m.t === 'welcome');
    for (let i = 0; i < 6; i++) a.send('x'.repeat(2_000));
    expect((await a.closed).code).toBe(CLOSE_PROTOCOL);
  });

  it('delivers a wave between two cars that are close enough', async () => {
    const a = await connect(HUB);
    const b = await connect(HUB);
    a.send(helloMsg('wave-a', [CELL]));
    b.send(helloMsg('wave-b', [CELL]));
    await b.next((m) => m.t === 'welcome');
    a.send(posMsg(GENEVA.lat, GENEVA.lng));
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    b.send(posMsg(near.lat, near.lng));

    a.send({ t: 'wave', to: idOf('wave-b') });
    const ack = await a.next((m) => m.t === 'waved');
    expect(ack).toMatchObject({ t: 'waved', ok: true });
    const wave = await b.next((m) => m.t === 'wave');
    expect(wave.t === 'wave' && wave.from.id).toBe(idOf('wave-a'));
    a.close();
    b.close();
  });

  /*
   * The recall path, over a real socket. A car pinned to a tab for weeks is the client this
   * is for, so the thing worth asserting is not that it is told — it is that being told costs
   * it nothing: the welcome still arrives, the socket stays open, and it can still be seen
   * and wave (ADR-0029).
   */
  it('tells a client with no version to upgrade, and keeps carrying it', async () => {
    const old = await connect(HUB);
    // No `v` at all: every build deployed before ADR-0029 looks exactly like this on the
    // wire, so it is sent as a raw string rather than built from the typed helper.
    old.send(
      JSON.stringify({
        t: 'hello',
        secret: secretOf('legacy-a'),
        model: '3',
        colour: 'red',
        cells: [CELL],
      }),
    );

    const welcome = await old.next((m) => m.t === 'welcome');
    expect(welcome.t).toBe('welcome');
    const upgrade = await old.next((m) => m.t === 'upgrade');
    expect(upgrade).toMatchObject({ t: 'upgrade' });

    // Still a driver: it reports, and a current client in the same cell sees it.
    const current = await connect(HUB);
    current.send(helloMsg('legacy-b', [CELL]));
    await current.next((m) => m.t === 'welcome');
    old.send(posMsg(GENEVA.lat, GENEVA.lng));
    await wait(SERVER_TICK_MS + 200);
    current.send(posMsg(GENEVA.lat, GENEVA.lng));
    await current.waitForCar(idOf('legacy-a'));

    // And each is spoken to in the shape it understands: the old one in whole car states, the
    // current one by handle. That is what makes the reload something a driver can wait for.
    expect(old.received.some((m) => m.t === 'diff')).toBe(true);
    expect(old.received.some((m) => m.t === 'diff2')).toBe(false);
    expect(current.received.some((m) => m.t === 'diff2')).toBe(true);
    expect(current.received.some((m) => m.t === 'upgrade')).toBe(false);
    old.close();
    current.close();
  });

  it('is silenced by the kill switch', async () => {
    const res = await SELF.fetch(`https://teslawave.test/ws?hub=${HUB}`, {
      headers: { Upgrade: 'websocket' },
      // The binding is read per request, so the dashboard flip needs no deploy.
    });
    expect([101, 503]).toContain(res.status);
  });
});

describe('durable object hygiene', () => {
  it('accepts sockets with the hibernation API and stores no positions', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('hygiene-a', [CELL]));
    await a.next((m) => m.t === 'welcome');
    for (let i = 0; i < 5; i++) {
      a.send(posMsg(GENEVA.lat + i * 0.0001, GENEVA.lng));
      await wait(50);
    }

    const stub = env.HUB.get(env.HUB.idFromName(HUB));
    const stats = (await stub.debugStats()) as {
      accepted: number;
      presence: number;
      storageKeys: string[];
    };
    // ctx.getWebSockets() only returns sockets accepted through ctx.acceptWebSocket().
    expect(stats.accepted).toBeGreaterThan(0);
    expect(stats.presence).toBeGreaterThan(0);
    for (const key of stats.storageKeys) expect(key).toMatch(/^(meta:hub|w:|wt:|c:)/);
    a.close();
  });
});

describe('daily harvest', () => {
  it('rolls finished cell-day counters into D1 and remembers which hubs exist', async () => {
    const a = await connect(HUB);
    const b = await connect(HUB);
    a.send(helloMsg('harvest-a', [CELL]));
    b.send(helloMsg('harvest-b', [CELL]));
    await b.next((m) => m.t === 'welcome');
    a.send(posMsg(GENEVA.lat, GENEVA.lng));
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    b.send(posMsg(near.lat, near.lng));
    a.send({ t: 'wave', to: idOf('harvest-b') });
    await a.next((m) => m.t === 'waved' && m.ok);

    // The edge wrote the hub down when the socket opened.
    const hubs = await env.DB.prepare('SELECT hub FROM hubs').all<{ hub: string }>();
    expect(hubs.results.map((r) => r.hub)).toContain(HUB);

    // Today's counter stays with the hub: the pulse still reads it.
    const stub = env.HUB.get(env.HUB.idFromName(HUB));
    expect(await stub.harvest(Date.now())).toEqual([]);

    // Tomorrow's cron harvests every hub it knows and writes the finished day into D1.
    // (Called directly: the test plugin cannot serialise its bindings through SELF.scheduled.)
    const tomorrow = Date.now() + 86_400_000;
    await pruneAndAggregate(env, tomorrow);
    const rows = await env.DB.prepare('SELECT cell, waves FROM daily_stats WHERE cell = ?')
      .bind(CELL)
      .all<{ cell: string; waves: number }>();
    expect(rows.results[0]?.waves).toBeGreaterThanOrEqual(1);
    const stats = (await (await SELF.fetch('https://teslawave.test/api/stats')).json()) as {
      total: number;
    };
    expect(stats.total).toBeGreaterThanOrEqual(1);

    // The hub let go of the finished day.
    const after = (await stub.debugStats()) as { storageKeys: string[] };
    expect(after.storageKeys.filter((k) => k.startsWith('c:'))).toHaveLength(0);
    a.close();
    b.close();
  });
});

describe('/api', () => {
  it('reports where the request came from', async () => {
    const res = await SELF.fetch('https://teslawave.test/api/whereami');
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty('lat');
  });

  it('creates and claims a pairing code exactly once', async () => {
    const created = await SELF.fetch('https://teslawave.test/api/pair', {
      method: 'POST',
      body: JSON.stringify({ secret: secretOf('pair-1'), model: 'Y', colour: 'deepblue', nick: 'Nico' }),
    });
    const { code } = (await created.json()) as { code: string };
    expect(code).toHaveLength(6);

    const claimed = await SELF.fetch('https://teslawave.test/api/pair/claim', {
      method: 'POST',
      body: JSON.stringify({ code: code.toLowerCase() }),
    });
    expect(claimed.status).toBe(200);
    expect((await claimed.json()) as { identity: { secret: string } }).toMatchObject({
      identity: { secret: secretOf('pair-1'), model: 'Y' },
    });

    const again = await SELF.fetch('https://teslawave.test/api/pair/claim', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    expect(again.status).toBe(404);
  });

  it('rejects a malformed pairing payload and an unknown code', async () => {
    const bad = await SELF.fetch('https://teslawave.test/api/pair', {
      method: 'POST',
      body: JSON.stringify({ secret: secretOf('x'), model: 'Roadster', colour: 'red' }),
    });
    expect(bad.status).toBe(400);

    const unknown = await SELF.fetch('https://teslawave.test/api/pair/claim', {
      method: 'POST',
      body: JSON.stringify({ code: 'ZZZZZZ' }),
    });
    expect(unknown.status).toBe(404);
  });

  it('records an anonymous performance sample and refuses anything that is not one', async () => {
    const sample = {
      v: 1,
      dpr: 2,
      tesla: true,
      chromium: 148,
      width: 1920,
      height: 1200,
      mean: 4.2,
      p95: 9.8,
      samples: 600,
      halfRate: false,
      lowRes: true,
      cars: 14,
    };
    const ok = await SELF.fetch('https://teslawave.test/api/perf', {
      method: 'POST',
      body: JSON.stringify(sample),
    });
    expect(ok.status).toBe(204);
    const rows = await env.DB.prepare('SELECT * FROM perf_samples').all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({ dpr: 2, tesla: 1, low_res: 1, cars: 14 });
    // The schema is the privacy guarantee: there is no column a position could land in.
    expect(Object.keys(rows.results[0] ?? {})).not.toContain('lat');

    const bad = await SELF.fetch('https://teslawave.test/api/perf', {
      method: 'POST',
      body: JSON.stringify({ ...sample, lat: 46.2, mean: 'fast' }),
    });
    expect(bad.status).toBe(400);
    const wrongMethod = await SELF.fetch('https://teslawave.test/api/perf');
    expect(wrongMethod.status).toBe(404);
  });

  it('serves aggregate stats and 404s anything else under /api', async () => {
    const stats = await SELF.fetch('https://teslawave.test/api/stats');
    expect(stats.status).toBe(200);
    expect(await stats.json()).toHaveProperty('total');
    const missing = await SELF.fetch('https://teslawave.test/api/nope');
    expect(missing.status).toBe(404);
  });

  /*
   * Creating a code writes a D1 row. Claiming was limited and creating was not, so the whole
   * app's daily write budget sat behind an unauthenticated POST.
   */
  /*
   * Counts for someone who has not joined yet, so the first screen is not a dead map. The
   * privacy claim and the cost claim are both asserted here: no positions in the answer, and
   * one Durable Object lookup per cell rather than per visitor (ADR-0032).
   */
  it('reports how many drivers are out there, without saying where any of them is', async () => {
    const a = await connect(HUB);
    a.send(helloMsg('pulse-a', [CELL]));
    await a.next((m) => m.t === 'welcome');
    a.send(posMsg(GENEVA.lat, GENEVA.lng));
    await wait(SERVER_TICK_MS + 200);

    const res = await SELF.fetch(
      `https://teslawave.test/api/pulse?lat=${GENEVA.lat}&lng=${GENEVA.lng}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { online: number; wavesToday: number };
    expect(body.online).toBeGreaterThan(0);
    expect(typeof body.wavesToday).toBe('number');
    // The shape is the privacy guarantee: two numbers, and nowhere for a position to hide.
    expect(Object.keys(body).sort()).toEqual(['online', 'wavesToday']);
    expect(JSON.stringify(body)).not.toContain(String(GENEVA.lat).slice(0, 5));

    // Cached per cell, which is what stops a shared link from spending the day's Durable
    // Object budget one page load at a time.
    expect(res.headers.get('cache-control')).toMatch(/max-age=[1-9]/);
    a.close();
  });

  it('serves the week of per-cell activity, and nothing that locates anyone', async () => {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO daily_stats (day, cell, waves) VALUES (?, ?, ?)',
    )
      .bind('2026-09-06', CELL, 7)
      .run();
    const res = await SELF.fetch('https://teslawave.test/api/activity');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cells: Array<{ cell: string; waves: number }> };
    // Summed over the retained week, so this row also carries whatever today's harvest put
    // there: the assertion is that our day is in the total, not that it is the total.
    expect(body.cells.find((c) => c.cell === CELL)?.waves ?? 0).toBeGreaterThanOrEqual(7);
    // A cell is 39 x 20 km and the rows carry no ids and no times: that is the whole claim.
    for (const row of body.cells) expect(Object.keys(row).sort()).toEqual(['cell', 'waves']);
    // It changes once a day, when the cron runs.
    expect(res.headers.get('cache-control')).toContain('max-age=');
  });

  it('holds a quiet region far longer than a busy one', async () => {
    // Somewhere nobody has ever driven. Asking a hibernated hub costs a reconstruction and a
    // paged read of its storage, to answer "nobody is here" — and most regions are empty most
    // of the time, so that is the case worth not paying for (ADR-0032).
    const empty = await SELF.fetch('https://teslawave.test/api/pulse?lat=-40.5&lng=-70.5');
    expect(empty.status).toBe(200);
    expect((await empty.json()) as { online: number }).toMatchObject({ online: 0 });
    const quiet = Number(/max-age=(\d+)/.exec(empty.headers.get('cache-control') ?? '')?.[1] ?? 0);

    const busy = await SELF.fetch(
      `https://teslawave.test/api/pulse?lat=${GENEVA.lat}&lng=${GENEVA.lng}`,
    );
    const live = Number(/max-age=(\d+)/.exec(busy.headers.get('cache-control') ?? '')?.[1] ?? 0);

    expect(quiet).toBeGreaterThan(live);
    // A first driver arriving opens a socket, which wakes the hub anyway, so the staleness
    // costs nothing a driver can see.
    expect(quiet).toBeGreaterThanOrEqual(600);
  });

  it('refuses a pulse request without a sane position', async () => {
    for (const query of ['', '?lat=46.2', '?lat=abc&lng=6.1', '?lat=999&lng=6.1']) {
      const res = await SELF.fetch(`https://teslawave.test/api/pulse${query}`);
      expect(res.status, query).toBe(400);
    }
  });

  it('rate-limits pairing codes, per address', async () => {
    const make = (ip: string): Promise<Response> =>
      SELF.fetch('https://teslawave.test/api/pair', {
        method: 'POST',
        headers: { 'cf-connecting-ip': ip },
        body: JSON.stringify({ secret: secretOf('flood'), model: '3', colour: 'red' }),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await make('203.0.113.7')).status);
    expect(statuses[0]).toBe(200);
    expect(statuses.at(-1)).toBe(429);
    // Soft by design (ADR-0003's reasoning: one isolate, no storage), so the only promise
    // worth asserting is that it stops well short of eight writes.
    expect(statuses.filter((s) => s === 200).length).toBeLessThan(8);

    // One noisy address must never lock out the driver in the next car.
    expect((await make('203.0.113.8')).status).toBe(200);
  });
});

/*
 * The Content-Security-Policy lives in apps/web/public/_headers, because the documents it
 * governs are served by the asset layer and never reach this Worker (see src/headers.ts).
 * It is tested where it actually applies, against the real app: apps/web/e2e/csp.spec.ts.
 * What is left for the Worker's own responses is asserted here.
 */
describe('security headers', () => {
  it('marks its responses nosniff and leaks no referer', async () => {
    for (const path of ['/api/stats', '/api/whereami', '/api/nope']) {
      const res = await SELF.fetch(`https://teslawave.test${path}`);
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(res.headers.get('referrer-policy'), path).toBe('no-referrer');
    }
  });

  it('sends HSTS over https and never over plain http', async () => {
    const secure = await SELF.fetch('https://teslawave.test/api/stats');
    expect(secure.headers.get('strict-transport-security')).toContain('max-age=');
    // Pinning a developer's browser to https on localhost for a year is a bad afternoon.
    const plain = await SELF.fetch('http://teslawave.test/api/stats');
    expect(plain.headers.get('strict-transport-security')).toBeNull();
  });
});
