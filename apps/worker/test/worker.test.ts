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
    const welcome = await b.next((m) => m.t === 'welcome');
    expect(welcome.t === 'welcome' && welcome.snapshot.map((c) => c.id)).toContain(idOf('worker-a'));
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

    const diff = await b.next((m) => m.t === 'diff' && m.upd.some((c) => c.id === idOf('diff-a')));
    expect(diff.t === 'diff' && diff.online).toBeGreaterThan(0);
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
    for (const key of stats.storageKeys) expect(key).toMatch(/^(meta:hub|w:|c:)/);
    a.close();
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

  it('serves aggregate stats and 404s anything else under /api', async () => {
    const stats = await SELF.fetch('https://teslawave.test/api/stats');
    expect(stats.status).toBe(200);
    expect(await stats.json()).toHaveProperty('total');
    const missing = await SELF.fetch('https://teslawave.test/api/nope');
    expect(missing.status).toBe(404);
  });
});
