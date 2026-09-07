import { beforeEach, describe, expect, it } from 'vitest';
import {
  CELL_PRECISION,
  CLOSE_CAPACITY,
  CLOSE_PROTOCOL,
  CLOSE_WRONG_HUB,
  LEGACY_PROTOCOL_VERSION,
  MAX_SOCKETS_PER_CELL,
  PRESENCE_EXPIRY_MS,
  PROTOCOL_VERSION,
  SERVER_TICK_MS,
  decodeBounds,
  destination,
  encode,
  hubOf,
  idFromSecret,
  type CarState,
  type ClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';
import {
  COUNTER_WRITE_MS,
  MAX_PERSIST_KEYS,
  USER_WAVES_TTL_MS,
  cellDayKey,
  createHub,
  flushIfDue,
  harvest,
  hubStats,
  onBadMessage,
  onClose,
  onMessage,
  openSocket,
  restoreSocket,
  userWavesKey,
} from '../src/index.js';
import { userWaveTsKey } from '../src/index.js';
import type { Effect, HubState } from '../src/index.js';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
const HUB = hubOf(CELL);
const NEIGHBOUR_POINT = destination(GENEVA.lat, GENEVA.lng, 0, 25_000);
const NEIGHBOUR_CELL = encode(NEIGHBOUR_POINT.lat, NEIGHBOUR_POINT.lng, CELL_PRECISION);
/** The cell immediately over CELL's northern edge, which is what a crossing actually enters. */
const ACROSS_EDGE = encode(decodeBounds(CELL).maxLat + 0.01, GENEVA.lng, CELL_PRECISION);

let state: HubState;
let now: number;

type SendEffect = Extract<Effect, { k: 'send' }>;
type CloseEffect = Extract<Effect, { k: 'close' }>;

const sendEffects = (effects: Effect[], to?: string): SendEffect[] =>
  effects.filter((e): e is SendEffect => e.k === 'send' && (to === undefined || e.to === to));

const sends = (effects: Effect[], to?: string): ServerMsg[] =>
  sendEffects(effects, to).map((e) => e.msg);

const closes = (effects: Effect[]): Array<{ to: string; code: number }> =>
  effects
    .filter((e): e is CloseEffect => e.k === 'close')
    .map((e) => ({ to: e.to, code: e.code }));

/** A test driver is named; the secret it holds and the id the hub gives it both follow. */
const secretOf = (name: string): string => `secret-${name}-0123456789`;
const ID = (name: string): string => idFromSecret(secretOf(name));

const hello = (key: string, name: string, cells: string[] = [CELL], extra: Partial<ClientMsg> = {}) => {
  openSocket(state, key);
  return onMessage(
    state,
    key,
    {
      t: 'hello',
      secret: secretOf(name),
      model: '3',
      colour: 'red',
      cells,
      v: PROTOCOL_VERSION,
      ...extra,
    } as ClientMsg,
    now,
  );
};

const pos = (key: string, lat: number, lng: number, speed = 50, heading = 90): Effect[] =>
  onMessage(state, key, { t: 'pos', lat, lng, heading, speed, ts: now }, now);

const diffsFor = (effects: Effect[], to: string): Extract<ServerMsg, { t: 'diff' }>[] =>
  sends(effects, to).filter((m): m is Extract<ServerMsg, { t: 'diff' }> => m.t === 'diff');

beforeEach(() => {
  now = 1_700_000_000_000;
  state = createHub(HUB, now);
});

describe('presence and diffs', () => {
  it('lets two drivers in the same cell see each other', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    const out = flushIfDue(state, now);
    const diff = diffsFor(out, 'b')[0];
    expect(diff?.upd.map((c) => c.id)).toEqual([ID('car-a')]);
    expect(diff?.online).toBe(1);
  });

  it('gives a late joiner a snapshot in its welcome', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    const out = hello('b', 'car-b');
    const welcome = sends(out, 'b').find((m) => m.t === 'welcome');
    expect(welcome?.t === 'welcome' && welcome.snapshot.map((c) => c.id)).toEqual([ID('car-a')]);
  });

  it('never sends a driver its own position back', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    const diff = diffsFor(flushIfDue(state, now), 'a')[0];
    expect(diff).toBeDefined();
    // The car is in its own cell diff (the client filters itself out) but the count is right.
    expect(diff?.online).toBe(1);
  });

  it('holds diffs back to one per cell per tick', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    expect(diffsFor(flushIfDue(state, now), 'b')).toHaveLength(1);
    now += 500;
    pos('a', GENEVA.lat + 0.001, GENEVA.lng);
    expect(flushIfDue(state, now)).toHaveLength(0);
    now += SERVER_TICK_MS;
    expect(diffsFor(flushIfDue(state, now), 'b')).toHaveLength(1);
  });

  it('announces a driver crossing a cell boundary as gone in the cell it left', () => {
    // Drive the last 200 m up to the northern edge of the cell and across it.
    const edge = decodeBounds(CELL).maxLat;
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    flushIfDue(state, now);

    now += 10_000; // ~72 km/h over 200 m, a plausible crossing
    pos('a', edge + 0.001, GENEVA.lng);
    const diffs = diffsFor(flushIfDue(state, now), 'b');
    const left = diffs.find((d) => d.cell === CELL);
    expect(left?.gone).toEqual([ID('car-a')]);
    expect(state.presence.get(ID('car-a'))?.cell).not.toBe(CELL);
  });

  /*
   * A departure means "gone from your map", not "gone from this cell". The distinction only
   * shows up for a subscriber who holds both sides of a border, and it is what made cars
   * blink out at every crossing: the two diffs are separate frames, and which one arrives
   * first depends on nothing more principled than which cell was marked dirty first.
   */
  it('does not report a crossing car as gone to someone who holds both cells', () => {
    const edge = decodeBounds(CELL).maxLat;
    hello('watcher', 'car-w', [CELL, ACROSS_EDGE]);
    hello('a', 'car-a', [CELL, ACROSS_EDGE]);
    pos('a', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    flushIfDue(state, now);

    now += 10_000;
    pos('a', edge + 0.001, GENEVA.lng);
    const diffs = diffsFor(flushIfDue(state, now), 'watcher');
    expect(diffs.flatMap((d) => d.gone)).toEqual([]);
    // And they are told where it went, so nothing is lost by staying quiet about the old cell.
    expect(diffs.flatMap((d) => d.upd.map((c) => c.id))).toContain(ID('car-a'));
  });

  it('still reports it gone to someone who holds only the cell it left', () => {
    const edge = decodeBounds(CELL).maxLat;
    hello('watcher', 'car-w', [CELL]);
    hello('a', 'car-a', [CELL, ACROSS_EDGE]);
    pos('a', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    flushIfDue(state, now);

    now += 10_000;
    pos('a', edge + 0.001, GENEVA.lng);
    const diffs = diffsFor(flushIfDue(state, now), 'watcher');
    expect(diffs.flatMap((d) => d.gone)).toEqual([ID('car-a')]);
  });

  it('only shows drivers in cells you subscribed to', () => {
    hello('a', 'car-a', [CELL]);
    hello('b', 'car-b', [NEIGHBOUR_CELL, CELL]);
    pos('a', GENEVA.lat, GENEVA.lng);
    pos('b', NEIGHBOUR_POINT.lat, NEIGHBOUR_POINT.lng);
    now += SERVER_TICK_MS;
    const out = flushIfDue(state, now);
    expect(diffsFor(out, 'b').flatMap((d) => d.upd.map((c) => c.id))).toContain(ID('car-a'));
    expect(diffsFor(out, 'a').flatMap((d) => d.upd.map((c) => c.id))).not.toContain(ID('car-b'));
  });

  it('sends a snapshot for a newly subscribed cell', () => {
    hello('a', 'car-a', [NEIGHBOUR_CELL]);
    pos('a', NEIGHBOUR_POINT.lat, NEIGHBOUR_POINT.lng);
    hello('b', 'car-b', [CELL]);
    const out = onMessage(state, 'b', { t: 'sub', cells: [CELL, NEIGHBOUR_CELL] }, now);
    const diff = diffsFor(out, 'b').find((d) => d.cell === NEIGHBOUR_CELL);
    expect(diff?.upd.map((c) => c.id)).toEqual([ID('car-a')]);
  });

  it('evicts a driver that stops sending after PRESENCE_EXPIRY_MS', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    flushIfDue(state, now);
    now += PRESENCE_EXPIRY_MS + 1_000;
    const diff = diffsFor(flushIfDue(state, now), 'b')[0];
    expect(diff?.gone).toEqual([ID('car-a')]);
    expect(state.presence.size).toBe(0);
  });

  it('keeps presence while the driver still has one socket, drops it with the last', () => {
    hello('phone', 'car-a');
    hello('car', 'car-a');
    pos('phone', GENEVA.lat, GENEVA.lng);
    onClose(state, 'phone');
    expect(state.presence.has(ID('car-a'))).toBe(true);
    onClose(state, 'car');
    expect(state.presence.has(ID('car-a'))).toBe(false);
  });
});

describe('hub boundaries and capacity', () => {
  it('refuses a hello for a cell owned by another hub', () => {
    const out = hello('a', 'car-a', ['sp3e']);
    expect(closes(out)[0]?.code).toBe(CLOSE_WRONG_HUB);
  });

  it('refuses a sub for a cell owned by another hub', () => {
    hello('a', 'car-a');
    const out = onMessage(state, 'a', { t: 'sub', cells: ['sp3e'] }, now);
    expect(closes(out)[0]?.code).toBe(CLOSE_WRONG_HUB);
  });

  it('caps sockets per cell', () => {
    for (let i = 0; i < MAX_SOCKETS_PER_CELL; i++) expect(closes(hello(`k${i}`, `id${i}`))).toHaveLength(0);
    expect(closes(hello('one-too-many', 'idX'))[0]?.code).toBe(CLOSE_CAPACITY);
  });
});

describe('rate limiting and abuse', () => {
  it('drops a position sent too soon without punishing jitter', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += 1_500;
    expect(pos('a', GENEVA.lat + 0.001, GENEVA.lng)).toHaveLength(0);
    expect(state.presence.get(ID('car-a'))?.lat).toBe(GENEVA.lat);
    expect(state.sockets.get('a')?.violations).toBe(0);
  });

  it('closes a socket that floods', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    let closed = 0;
    for (let i = 0; i < 6; i++) {
      now += 10;
      closed += closes(pos('a', GENEVA.lat, GENEVA.lng)).length;
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('closes a socket that sends garbage repeatedly', () => {
    hello('a', 'car-a');
    let last: Effect[] = [];
    for (let i = 0; i < 5; i++) last = onBadMessage(state, 'a');
    expect(closes(last)[0]?.code).toBe(CLOSE_PROTOCOL);
  });

  it('rejects impossible speeds and teleports', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng, 300);
    expect(state.presence.has(ID('car-a'))).toBe(false);
    now += SERVER_TICK_MS;
    pos('a', GENEVA.lat, GENEVA.lng, 50);
    expect(state.presence.has(ID('car-a'))).toBe(true);
    now += SERVER_TICK_MS;
    const far = destination(GENEVA.lat, GENEVA.lng, 90, 5_000); // 5 km in 2 s
    pos('a', far.lat, far.lng, 50);
    expect(state.presence.get(ID('car-a'))?.lat).toBe(GENEVA.lat);
  });
});

describe('waves', () => {
  const twoCars = (): void => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    pos('b', near.lat, near.lng);
  };

  it('delivers a wave to a car in range and counts it for both', () => {
    twoCars();
    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(out, 'a')[0]).toMatchObject({ t: 'waved', ok: true });
    expect(sends(out, 'b')[0]).toMatchObject({ t: 'wave', from: { id: ID('car-a') } });
    expect(state.counters.wavesByUser.get(userWavesKey(ID('car-a')))).toBe(1);
    expect(state.counters.wavesByUser.get(userWavesKey(ID('car-b')))).toBe(1);
    expect(state.presence.get(ID('car-a'))?.waves).toBe(1);
  });

  it('reaches every device of the target', () => {
    twoCars();
    hello('b-phone', 'car-b');
    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    const targets = sendEffects(out)
      .filter((e) => e.msg.t === 'wave')
      .map((e) => e.to);
    expect(new Set(targets)).toEqual(new Set(['b', 'b-phone']));
  });

  it('refuses a wave that is out of range', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    const far = destination(GENEVA.lat, GENEVA.lng, 90, 1_000);
    pos('b', far.lat, far.lng);
    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(out, 'a')[0]).toMatchObject({ t: 'waved', ok: false, reason: 'range' });
    expect(state.counters.wavesByUser.size).toBe(0);
  });

  it('refuses a wave to somebody who is not online, hidden, or waving too fast', () => {
    twoCars();
    expect(sends(onMessage(state, 'a', { t: 'wave', to: ID('ghost') }, now), 'a')[0]).toMatchObject({
      ok: false,
      reason: 'offline',
    });
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now), 'a')[0]).toMatchObject({
      ok: false,
      reason: 'rate',
    });
    onMessage(state, 'b', { t: 'hide' }, now);
    expect(sends(onMessage(state, 'b', { t: 'wave', to: ID('car-a') }, now), 'b')[0]).toMatchObject({
      ok: false,
      reason: 'hidden',
    });
  });

  it('refuses a wave whose target is in a cell another hub owns, even with both cars held', () => {
    // Two cars just over the boundary, reporting to this hub as well as to their own.
    const away = { lat: GENEVA.lat, lng: GENEVA.lng + 12 };
    const awayCell = encode(away.lat, away.lng, CELL_PRECISION);
    expect(hubOf(awayCell)).not.toBe(HUB);
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', away.lat, away.lng);
    const near = destination(away.lat, away.lng, 90, 100);
    pos('b', near.lat, near.lng);
    expect(state.presence.get(ID('car-b'))?.cell).toBe(awayCell);

    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(out, 'a')[0]).toMatchObject({ t: 'waved', ok: false, reason: 'offline' });
    expect(sends(out, 'b')).toHaveLength(0);
    expect(state.counters.wavesByUser.size).toBe(0);
  });

  it('records waves per cell and day for the regional pulse', () => {
    twoCars();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += SERVER_TICK_MS;
    const diff = diffsFor(flushIfDue(state, now), 'b')[0];
    expect(diff?.wavesToday).toBe(1);
    expect(diff?.lastWaveTs).not.toBeNull();
  });
});

describe('invisible mode', () => {
  it('removes the driver from the map and stops accepting positions', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    flushIfDue(state, now);
    onMessage(state, 'a', { t: 'hide' }, now);
    now += SERVER_TICK_MS;
    expect(diffsFor(flushIfDue(state, now), 'b')[0]?.gone).toEqual([ID('car-a')]);
    pos('a', GENEVA.lat, GENEVA.lng);
    expect(state.presence.has(ID('car-a'))).toBe(false);
    onMessage(state, 'a', { t: 'show' }, now);
    now += SERVER_TICK_MS;
    pos('a', GENEVA.lat, GENEVA.lng);
    expect(state.presence.has(ID('car-a'))).toBe(true);
  });

  it('keeps spectators off the map entirely', () => {
    hello('s', 'watcher', [CELL], { spectator: true } as Partial<ClientMsg>);
    pos('s', GENEVA.lat, GENEVA.lng);
    expect(state.presence.size).toBe(0);
  });
});

describe('cost invariants', () => {
  it('persists counters at most once per COUNTER_WRITE_MS and never a position', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    pos('b', near.lat, near.lng);
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);

    now += SERVER_TICK_MS;
    expect(flushIfDue(state, now).filter((e) => e.k === 'persist')).toHaveLength(0);

    now += COUNTER_WRITE_MS;
    const persists = flushIfDue(state, now).filter((e) => e.k === 'persist');
    expect(persists).toHaveLength(1);
    const entries = persists[0]!.k === 'persist' ? persists[0]!.entries : [];
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(key).toMatch(/^(w:|wt:|c:)/);
      expect(typeof value).toBe('number');
    }
    const serialised = JSON.stringify(entries);
    expect(serialised).not.toContain('lat');
    expect(serialised).not.toContain(String(GENEVA.lat));
  });

  it('keeps no positions once every driver is gone', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    onClose(state, 'a');
    expect(state.presence.size).toBe(0);
    expect(hubStats(state).sockets).toBe(0);
  });

  it('handles a busy hub well inside the duration budget', () => {
    const drivers = 300;
    for (let i = 0; i < drivers; i++) hello(`k${i}`, `id${i}`, [i % 2 === 0 ? CELL : NEIGHBOUR_CELL]);
    const started = Date.now();
    let ticks = 0;
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < drivers; i++) {
        const base = i % 2 === 0 ? GENEVA : NEIGHBOUR_POINT;
        pos(`k${i}`, base.lat + i * 1e-4, base.lng + round * 1e-4);
        ticks += flushIfDue(state, now).length;
      }
      now += SERVER_TICK_MS + 1;
    }
    const ms = Date.now() - started;
    expect(ticks).toBeGreaterThan(0);
    // 3000 positions plus the fan-out. Cloudflare's own model assumes 10 ms per message;
    // this must stay far below that or the duration budget in ADR-0002 does not hold.
    expect(ms / 3_000).toBeLessThan(2);
  });
});

describe('hibernation', () => {
  it('rebuilds its indexes from attachments after a wake, with no positions', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    const profile = state.sockets.get('a')!;

    // The object hibernates: everything in memory is discarded.
    const woken = createHub(HUB, now, { wavesByUser: new Map([[userWavesKey(ID('car-a')), 4]]) });
    restoreSocket(woken, {
      key: profile.key,
      id: profile.id,
      model: profile.model,
      colour: profile.colour,
      cells: profile.cells,
      spectator: profile.spectator,
      hidden: profile.hidden,
      since: profile.since,
    });

    expect(hubStats(woken).sockets).toBe(1);
    expect(woken.presence.size).toBe(0);
    // The client refills presence within one send interval, carrying its wave count.
    now += SERVER_TICK_MS;
    onMessage(woken, 'a', { t: 'pos', lat: GENEVA.lat, lng: GENEVA.lng, heading: 90, speed: 50, ts: now }, now);
    const car: CarState | undefined = woken.presence.get(ID('car-a'));
    expect(car?.waves).toBe(4);
    expect(car?.cell).toBe(CELL);
  });
});

describe('counter writes stay inside the row-write budget', () => {
  it('persists only the counters that changed', () => {
    // 100 drivers report positions; two of them wave.
    for (let i = 0; i < 100; i++) {
      hello(`k${i}`, `id${i}`);
      pos(`k${i}`, GENEVA.lat + i * 1e-5, GENEVA.lng);
    }
    onMessage(state, 'k0', { t: 'wave', to: ID('id1') }, now);
    now += COUNTER_WRITE_MS + SERVER_TICK_MS;
    const persists = flushIfDue(state, now).filter((e) => e.k === 'persist');
    const entries = persists[0]?.k === 'persist' ? persists[0].entries : [];
    // Two user counters with their timestamps, and one cell-day counter. Not one row per
    // connected driver.
    expect(entries).toHaveLength(5);
    expect(state.counters.dirtyKeys.size).toBe(0);
  });

  it('writes nothing at all when nobody waves', () => {
    for (let i = 0; i < 50; i++) {
      hello(`k${i}`, `id${i}`);
      pos(`k${i}`, GENEVA.lat + i * 1e-5, GENEVA.lng);
    }
    now += COUNTER_WRITE_MS + SERVER_TICK_MS;
    expect(flushIfDue(state, now).filter((e) => e.k === 'persist')).toHaveLength(0);
  });
});

describe('daily harvest', () => {
  const DAY = 86_400_000;

  it('hands over finished days, keeps today, and forgets nothing else', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    pos('b', near.lat, near.lng);
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);

    expect(harvest(state, now).cellDays).toEqual([]);
    expect(state.counters.wavesByCellDay.get(cellDayKey(CELL, now))).toBe(1);

    const tomorrow = now + DAY;
    const result = harvest(state, tomorrow);
    expect(result.cellDays).toEqual([{ cell: CELL, day: new Date(now).toISOString().slice(0, 10), waves: 1 }]);
    expect(result.deleteKeys).toEqual([cellDayKey(CELL, now)]);
    expect(state.counters.wavesByCellDay.size).toBe(0);
    // The drivers' own counters are a day old, nowhere near the TTL.
    expect(state.counters.wavesByUser.size).toBe(2);
    expect(JSON.stringify(result)).not.toContain(String(GENEVA.lat));
  });

  it('forgets a driver who has not waved in USER_WAVES_TTL_MS, and only then', () => {
    const woken = createHub(HUB, now, {
      wavesByUser: new Map([
        [userWavesKey('old'), 7],
        [userWavesKey('recent'), 3],
      ]),
      lastWaveByUser: new Map([
        [userWaveTsKey('old'), now - USER_WAVES_TTL_MS - DAY],
        [userWaveTsKey('recent'), now - DAY],
      ]),
    });
    const result = harvest(woken, now);
    expect(new Set(result.deleteKeys)).toEqual(new Set([userWavesKey('old'), userWaveTsKey('old')]));
    expect(woken.counters.wavesByUser.has(userWavesKey('old'))).toBe(false);
    expect(woken.counters.wavesByUser.get(userWavesKey('recent'))).toBe(3);
  });

  it('gives a counter from before the timestamps one now, a bounded batch at a time', () => {
    const wavesByUser = new Map<string, number>();
    for (let i = 0; i < MAX_PERSIST_KEYS + 10; i++) wavesByUser.set(userWavesKey(`legacy${i}`), 1);
    const woken = createHub(HUB, now, { wavesByUser });

    const first = harvest(woken, now);
    expect(first.deleteKeys).toEqual([]);
    expect(first.persist).toHaveLength(MAX_PERSIST_KEYS);
    for (const [key, value] of first.persist) {
      expect(key).toMatch(/^wt:/);
      expect(value).toBe(now);
    }
    const second = harvest(woken, now);
    expect(second.persist).toHaveLength(10);
    expect(harvest(woken, now).persist).toEqual([]);
    // Counted from today: not forgotten until the TTL has passed from now.
    expect(harvest(woken, now + USER_WAVES_TTL_MS - DAY).deleteKeys).toEqual([]);
    expect(harvest(woken, now + USER_WAVES_TTL_MS + DAY).deleteKeys).toHaveLength(2 * (MAX_PERSIST_KEYS + 10));
  });
});

describe('the version handshake', () => {
  const upgrades = (effects: Effect[], to: string): Extract<ServerMsg, { t: 'upgrade' }>[] =>
    sends(effects, to).filter((m): m is Extract<ServerMsg, { t: 'upgrade' }> => m.t === 'upgrade');

  it('says nothing to a client that speaks the current version', () => {
    expect(upgrades(hello('a', 'car-a'), 'a')).toEqual([]);
  });

  it('tells an older client to upgrade, without closing it', () => {
    const out = hello('a', 'car-a', [CELL], { v: LEGACY_PROTOCOL_VERSION } as Partial<ClientMsg>);
    expect(upgrades(out, 'a')).toEqual([{ t: 'upgrade', v: PROTOCOL_VERSION }]);
    // The point of not closing: the driver keeps the map until they are standing still.
    expect(closes(out)).toEqual([]);
    expect(sends(out, 'a').some((m) => m.t === 'welcome')).toBe(true);
  });

  it('still carries an old client: it can see, be seen and wave', () => {
    hello('a', 'car-a', [CELL], { v: LEGACY_PROTOCOL_VERSION } as Partial<ClientMsg>);
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    pos('b', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    expect(diffsFor(flushIfDue(state, now), 'b')[0]?.upd.map((c) => c.id)).toContain(ID('car-a'));

    const waved = sends(onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now), 'a');
    expect(waved).toContainEqual({ t: 'waved', to: ID('car-b'), ok: true });
  });

  it('leaves a client from the future alone: it is the hub that is behind', () => {
    const out = hello('a', 'car-a', [CELL], { v: PROTOCOL_VERSION + 5 } as Partial<ClientMsg>);
    expect(upgrades(out, 'a')).toEqual([]);
    expect(closes(out)).toEqual([]);
  });
});
