import { beforeEach, describe, expect, it } from 'vitest';
import {
  CELL_PRECISION,
  CLOSE_CAPACITY,
  CLOSE_PROTOCOL,
  CLOSE_WRONG_HUB,
  INTEREST_RADIUS_M,
  LEGACY_PROTOCOL_VERSION,
  MAX_SOCKETS_PER_CELL,
  PRESENCE_EXPIRY_MS,
  PROTOCOL_VERSION,
  SERVER_TICK_MS,
  WAVE_HOLD_MS,
  WIRE_COORD_SCALE,
  decodeBounds,
  destination,
  encode,
  haversineM,
  hubOf,
  idFromSecret,
  type CarState,
  type CarWire,
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

const sends = (effects: Effect[], to?: string): ServerMsg[] => {
  // Every accessor goes through here, so this is the one place that has to notice a handle
  // being introduced. A handle is only ever explained once, in the meta of the diff that
  // first mentions it, so a reader that misses that message can never name the car again.
  learn(effects);
  return sendEffects(effects, to).map((e) => e.msg);
};

const closes = (effects: Effect[]): Array<{ to: string; code: number }> =>
  effects
    .filter((e): e is CloseEffect => e.k === 'close')
    .map((e) => ({ to: e.to, code: e.code }));

/** A test driver is named; the secret it holds and the id the hub gives it both follow. */
const secretOf = (name: string): string => `secret-${name}-0123456789`;
const ID = (name: string): string => idFromSecret(secretOf(name));

const hello = (key: string, name: string, cells: string[] = [CELL], extra: Partial<ClientMsg> = {}) => {
  openSocket(state, key);
  return learned(onMessage(
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
  ));
};

const pos = (key: string, lat: number, lng: number, speed = 50, heading = 90): Effect[] =>
  learned(onMessage(state, key, { t: 'pos', lat, lng, heading, speed, ts: now }, now));

/**
 * A flush, with the handles it introduces remembered.
 *
 * Every flush has to go through here, including the ones whose result a test throws away: a
 * handle is explained exactly once, in the diff that first mentions it, so a reader that
 * misses that message can never name the car again.
 */
const flush = (force = false): Effect[] => learned(flushIfDue(state, now, force));

const diffsFor = (effects: Effect[], to: string): Extract<ServerMsg, { t: 'diff' }>[] =>
  sends(effects, to).filter((m): m is Extract<ServerMsg, { t: 'diff' }> => m.t === 'diff');

const diff2sFor = (effects: Effect[], to: string): Extract<ServerMsg, { t: 'diff2' }>[] =>
  sends(effects, to).filter((m): m is Extract<ServerMsg, { t: 'diff2' }> => m.t === 'diff2');

/*
 * The wire below is v2, which refers to cars by handle. These read either shape back into
 * driver ids so the behavioural assertions say what they mean — "this driver appeared", not
 * "handle 7 appeared" — and so the same test covers both encoders.
 *
 * Handles are learned from the `meta` the hub sends when a car comes into range; the map is
 * accumulated across a whole run because that is exactly the contract: described once, then
 * referred to by number for as long as the connection holds it.
 */
const handleNames = new Map<number, string>();

function learn(effects: Effect[]): void {
  for (const e of effects)
    if (e.k === 'send' && e.msg.t === 'diff2')
      for (const m of e.msg.meta) handleNames.set(m.h, m.id);
}

const learned = (effects: Effect[]): Effect[] => {
  learn(effects);
  return effects;
};

/** Every car id the hub told `to` about in these effects, on either wire. */
const updIds = (effects: Effect[], to: string): string[] => {
  const out: string[] = [];
  for (const msg of sends(effects, to)) {
    if (msg.t === 'diff') out.push(...msg.upd.map((c) => c.id));
    if (msg.t === 'diff2')
      for (const car of msg.upd) {
        const id = handleNames.get(car[0]);
        if (id) out.push(id);
      }
  }
  return out;
};

/** Every car id the hub told `to` was gone, on either wire. */
const goneIds = (effects: Effect[], to: string): string[] => {
  const out: string[] = [];
  for (const msg of sends(effects, to)) {
    if (msg.t === 'diff') out.push(...msg.gone);
    if (msg.t === 'diff2')
      for (const h of msg.gone) {
        const id = handleNames.get(h);
        if (id) out.push(id);
      }
  }
  return out;
};

/** The counters, whichever shape carried them. */
const statsFor = (
  effects: Effect[],
  to: string,
): Array<{ cell: string; online: number; wavesToday: number; lastWaveTs: number | null }> =>
  sends(effects, to)
    .filter((m): m is Extract<ServerMsg, { t: 'diff' | 'diff2' }> => m.t === 'diff' || m.t === 'diff2')
    .map((m) => ({
      cell: m.cell,
      online: m.online,
      wavesToday: m.wavesToday,
      lastWaveTs: m.lastWaveTs,
    }));

beforeEach(() => {
  now = 1_700_000_000_000;
  state = createHub(HUB, now);
  handleNames.clear();
});

describe('presence and diffs', () => {
  it('lets two drivers in the same cell see each other', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    const out = flush();
    expect(updIds(out, 'b')).toEqual([ID('car-a')]);
    expect(statsFor(out, 'b')[0]?.online).toBe(1);
  });

  it('gives a late joiner what is already on the road, before the first tick', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    const out = hello('b', 'car-b');
    // A compact client is told in the opening diffs rather than in the welcome, so that a
    // car is described once and then referred to by handle. Either way it arrives at once.
    expect(updIds(out, 'b')).toEqual([ID('car-a')]);
  });

  it('never sends a driver its own position back', () => {
    hello('a', 'car-a');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    const out = flush();
    // Not in its own update at all now: the compact wire is built per subscriber, so there is
    // no shared message a driver has to filter itself out of.
    expect(updIds(out, 'a')).toEqual([]);
    expect(statsFor(out, 'a')[0]?.online).toBe(1);
  });

  it('holds diffs back to one per cell per tick', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    expect(statsFor(flush(), 'b')).toHaveLength(1);
    now += 500;
    pos('a', GENEVA.lat + 0.001, GENEVA.lng);
    expect(flush()).toHaveLength(0);
    now += SERVER_TICK_MS;
    expect(statsFor(flush(), 'b')).toHaveLength(1);
  });

  it('announces a driver crossing a cell boundary as gone in the cell it left', () => {
    // Drive the last 200 m up to the northern edge of the cell and across it.
    const edge = decodeBounds(CELL).maxLat;
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    flush();

    now += 10_000; // ~72 km/h over 200 m, a plausible crossing
    pos('a', edge + 0.001, GENEVA.lng);
    expect(goneIds(flush(), 'b')).toEqual([ID('car-a')]);
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
    flush();

    now += 10_000;
    pos('a', edge + 0.001, GENEVA.lng);
    const out = flush();
    expect(goneIds(out, 'watcher')).toEqual([]);
    // And they are told where it went, so nothing is lost by staying quiet about the old cell.
    expect(updIds(out, 'watcher')).toContain(ID('car-a'));
  });

  it('still reports it gone to someone who holds only the cell it left', () => {
    const edge = decodeBounds(CELL).maxLat;
    hello('watcher', 'car-w', [CELL]);
    hello('a', 'car-a', [CELL, ACROSS_EDGE]);
    pos('a', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    flush();

    now += 10_000;
    pos('a', edge + 0.001, GENEVA.lng);
    expect(goneIds(flush(), 'watcher')).toEqual([ID('car-a')]);
  });

  it('only shows drivers in cells you subscribed to', () => {
    // A kilometre either side of a cell border: close enough that interest is not what
    // decides this, so the assertion is about the subscription and nothing else.
    const edge = decodeBounds(CELL).maxLat;
    hello('a', 'car-a', [CELL]);
    hello('b', 'car-b', [ACROSS_EDGE, CELL]);
    pos('a', edge - 0.01, GENEVA.lng);
    pos('b', edge + 0.01, GENEVA.lng);
    now += SERVER_TICK_MS;
    const out = flush();
    expect(updIds(out, 'b')).toContain(ID('car-a'));
    expect(updIds(out, 'a')).not.toContain(ID('car-b'));
  });

  it('sends a snapshot for a newly subscribed cell', () => {
    hello('a', 'car-a', [NEIGHBOUR_CELL]);
    pos('a', NEIGHBOUR_POINT.lat, NEIGHBOUR_POINT.lng);
    hello('b', 'car-b', [CELL]);
    const out = onMessage(state, 'b', { t: 'sub', cells: [CELL, NEIGHBOUR_CELL] }, now);
    expect(updIds(out, 'b')).toEqual([ID('car-a')]);
  });

  it('describes a car again when it comes back into a cell the connection let go of and re-held', () => {
    const edge = decodeBounds(CELL).maxLat;
    hello('a', 'car-a', [CELL, ACROSS_EDGE]);
    hello('b', 'car-b', [CELL, ACROSS_EDGE]);
    pos('a', edge - 0.01, GENEVA.lng);
    pos('b', edge + 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    expect(updIds(flush(), 'a')).toContain(ID('car-b'));

    // A drives on and lets go of the cell B is in. A's client drops B on its own.
    onMessage(state, 'a', { t: 'sub', cells: [CELL] }, now);

    // B drives south into A's cell, at a speed the hub believes. The hub used to remember it
    // was still "holding" B for A and send six numbers for a handle A had forgotten, so B
    // never reappeared.
    now += 10_000;
    pos('b', edge - 0.001, GENEVA.lng);
    now += SERVER_TICK_MS;
    const out = flush();
    const described = diff2sFor(out, 'a').flatMap((d) => d.meta.map((m) => m.id));
    expect(described).toContain(ID('car-b'));
  });

  it('evicts a driver that stops sending after PRESENCE_EXPIRY_MS', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    flush();
    now += PRESENCE_EXPIRY_MS + 1_000;
    expect(goneIds(flush(), 'b')).toEqual([ID('car-a')]);
    expect(state.presence.size).toBe(0);
  });

  it('keeps presence while the driver still has one socket, drops it with the last', () => {
    hello('phone', 'car-a');
    hello('car', 'car-a');
    pos('phone', GENEVA.lat, GENEVA.lng);
    onClose(state, 'phone', now);
    expect(state.presence.has(ID('car-a'))).toBe(true);
    onClose(state, 'car', now);
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
    const stats = statsFor(flush(), 'b')[0];
    expect(stats?.wavesToday).toBe(1);
    expect(stats?.lastWaveTs).not.toBeNull();
  });
});

describe('invisible mode', () => {
  it('removes the driver from the map and stops accepting positions', () => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    flush();
    onMessage(state, 'a', { t: 'hide' }, now);
    now += SERVER_TICK_MS;
    expect(goneIds(flush(), 'b')).toEqual([ID('car-a')]);
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
    expect(flush().filter((e) => e.k === 'persist')).toHaveLength(0);

    now += COUNTER_WRITE_MS;
    const persists = flush().filter((e) => e.k === 'persist');
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
    onClose(state, 'a', now);
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
        ticks += flush().length;
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
      v: profile.v,
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

describe('a wave into a hub that cannot place somebody yet', () => {
  /** Two cars side by side, then the object hibernates and wakes with their sockets only. */
  const wake = (hiddenB = false): void => {
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);
    pos('b', near.lat, near.lng);
    if (hiddenB) onMessage(state, 'b', { t: 'hide' }, now);
    const woken = createHub(HUB, now);
    for (const s of state.sockets.values())
      restoreSocket(woken, {
        key: s.key,
        id: s.id,
        model: s.model,
        colour: s.colour,
        cells: s.cells,
        spectator: s.spectator,
        hidden: s.hidden,
        since: s.since,
        v: s.v,
      });
    state = woken;
    expect(state.presence.size).toBe(0);
  };
  const near = destination(GENEVA.lat, GENEVA.lng, 90, 100);

  it('asks both drivers where they are instead of calling the sender hidden', () => {
    wake();
    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(out, 'a')).toEqual([{ t: 'where' }]);
    expect(sends(out, 'b')).toEqual([{ t: 'where' }]);
    expect(hubStats(state).held).toBe(1);
  });

  it('delivers the wave the moment both answers are in', () => {
    wake();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += 100;
    expect(sends(pos('b', near.lat, near.lng))).toHaveLength(0);
    now += 100;
    const out = pos('a', GENEVA.lat, GENEVA.lng);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: true }]);
    expect(sends(out, 'b')[0]).toMatchObject({ t: 'wave', from: { id: ID('car-a') } });
    expect(state.counters.wavesByUser.get(userWavesKey(ID('car-a')))).toBe(1);
    expect(state.counters.wavesByUser.get(userWavesKey(ID('car-b')))).toBe(1);
    expect(hubStats(state).held).toBe(0);
  });

  it('still refuses the wave on range once it can be placed', () => {
    wake();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += 100;
    pos('a', GENEVA.lat, GENEVA.lng);
    const far = destination(GENEVA.lat, GENEVA.lng, 90, 1_000);
    const out = pos('b', far.lat, far.lng);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'range' }]);
    expect(state.counters.wavesByUser.size).toBe(0);
  });

  it('calls the target off the map when they never answer, at the next message of any kind', () => {
    wake();
    hello('c', 'car-c');
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += 100;
    pos('a', GENEVA.lat, GENEVA.lng);
    // Not yet: they have until WAVE_HOLD_MS.
    now += WAVE_HOLD_MS - 200;
    expect(sends(pos('c', GENEVA.lat, GENEVA.lng), 'a')).toHaveLength(0);
    now += 200;
    const out = pos('c', GENEVA.lat, GENEVA.lng);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'offline' }]);
    expect(hubStats(state).held).toBe(0);
  });

  it('names its own silence honestly when the sender never answers', () => {
    wake();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += 100;
    pos('b', near.lat, near.lng);
    now += WAVE_HOLD_MS;
    const out = pos('b', near.lat, near.lng);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'nofix' }]);
  });

  it('does not hold a wave for a target with no connection that could answer', () => {
    wake(true);
    const hidden = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(hidden, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'offline' }]);
    expect(sends(hidden, 'b')).toHaveLength(0);
    const nobody = onMessage(state, 'a', { t: 'wave', to: ID('ghost') }, now);
    expect(sends(nobody, 'a')).toEqual([{ t: 'waved', to: ID('ghost'), ok: false, reason: 'offline' }]);
    expect(hubStats(state).held).toBe(0);
  });

  it('settles as soon as the target closes rather than waiting out the hold', () => {
    wake();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    now += 100;
    const out = onClose(state, 'b', now);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'offline' }]);
    expect(hubStats(state).held).toBe(0);
  });

  it('is still the driver\'s own doing when they hide while it is held', () => {
    wake();
    onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    const out = onMessage(state, 'a', { t: 'hide' }, now);
    expect(sends(out, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'hidden' }]);
  });

  it('holds one wave per connection and asks one car once for everybody', () => {
    wake();
    hello('c', 'car-c');
    pos('c', GENEVA.lat, GENEVA.lng);
    const first = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(first, 'b')).toEqual([{ t: 'where' }]);
    const again = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(again, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: false, reason: 'rate' }]);
    // Somebody else waving at the same car does not ask it a second time inside the rate
    // limit: its two answers would have counted as abuse.
    const other = onMessage(state, 'c', { t: 'wave', to: ID('car-b') }, now + 500);
    expect(sends(other, 'b')).toHaveLength(0);
    expect(hubStats(state).held).toBe(2);
    now += 1_000;
    // One answer from the car they are both waving at settles the wave the hub could
    // already place the sender of; the other waits on its own sender.
    const fromC = pos('b', near.lat, near.lng);
    expect(sends(fromC, 'b').filter((m) => m.t === 'wave')).toMatchObject([{ from: { id: ID('car-c') } }]);
    expect(hubStats(state).held).toBe(1);
    const fromA = pos('a', GENEVA.lat, GENEVA.lng);
    expect(sends(fromA, 'b').filter((m) => m.t === 'wave')).toMatchObject([{ from: { id: ID('car-a') } }]);
    expect(hubStats(state).held).toBe(0);
  });

  it('holds a wave from a live hub too, when the sender\'s own presence has expired', () => {
    // A driver whose positions stopped, socket still open, for longer than the expiry.
    hello('a', 'car-a');
    hello('b', 'car-b');
    pos('a', GENEVA.lat, GENEVA.lng);
    now += PRESENCE_EXPIRY_MS + SERVER_TICK_MS;
    pos('b', near.lat, near.lng);
    flush();
    expect(state.presence.has(ID('car-a'))).toBe(false);
    const out = onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now);
    expect(sends(out, 'a')).toEqual([{ t: 'where' }]);
    expect(sends(out, 'b')).toHaveLength(0);
    now += 100;
    const answered = pos('a', GENEVA.lat, GENEVA.lng);
    expect(sends(answered, 'a')).toEqual([{ t: 'waved', to: ID('car-b'), ok: true }]);
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
    const persists = flush().filter((e) => e.k === 'persist');
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
    expect(flush().filter((e) => e.k === 'persist')).toHaveLength(0);
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
    const out = flush();
    expect(updIds(out, 'b')).toContain(ID('car-a'));
    // And it is still spoken to in the shape it understands, not the one it cannot parse.
    expect(diffsFor(out, 'a')).not.toHaveLength(0);
    expect(diff2sFor(out, 'a')).toHaveLength(0);

    const waved = sends(onMessage(state, 'a', { t: 'wave', to: ID('car-b') }, now), 'a');
    expect(waved).toContainEqual({ t: 'waved', to: ID('car-b'), ok: true });
  });

  it('leaves a client from the future alone: it is the hub that is behind', () => {
    const out = hello('a', 'car-a', [CELL], { v: PROTOCOL_VERSION + 5 } as Partial<ClientMsg>);
    expect(upgrades(out, 'a')).toEqual([]);
    expect(closes(out)).toEqual([]);
  });
});

/*
 * The reason for the version bump. At twenty cars the old wire was fine; at five hundred it
 * was 102 kB per subscriber every two seconds and fifty megabytes a tick out of one object,
 * which is a cliff a dense city walks off long before the socket cap is reached (ADR-0033).
 */
describe('the compact wire', () => {
  const wireOfCar = (effects: Effect[], to: string, name: string): CarWire | undefined => {
    for (const msg of sends(effects, to))
      if (msg.t === 'diff2')
        for (const car of msg.upd) if (handleNames.get(car[0]) === ID(name)) return car;
    return undefined;
  };

  it('describes a car once, then refers to it by handle', () => {
    hello('a', 'car-a');
    hello('watcher', 'car-w');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;

    const first = diff2sFor(flush(), 'watcher');
    expect(first.flatMap((d) => d.meta).map((m) => m.id)).toEqual([ID('car-a')]);
    const handle = first.flatMap((d) => d.meta)[0]?.h;
    expect(handle).toBeGreaterThan(0);

    now += SERVER_TICK_MS;
    pos('a', GENEVA.lat + 0.001, GENEVA.lng);
    const second = diff2sFor(flush(), 'watcher');
    // Nothing about the car changed, only where it is. Saying its model, colour, name, id
    // and join time again every two seconds is most of what the old wire cost.
    expect(second.flatMap((d) => d.meta)).toEqual([]);
    expect(second.flatMap((d) => d.upd).map((c) => c[0])).toEqual([handle]);
  });

  it('describes it again, and only then, when the driver edits their car', () => {
    hello('a', 'car-a');
    hello('watcher', 'car-w');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    flush();

    // A garage edit goes down the open socket as a fresh hello (ADR-0019's amendment).
    hello('a', 'car-a', [CELL], { colour: 'ultrared' } as Partial<ClientMsg>);
    now += SERVER_TICK_MS;
    pos('a', GENEVA.lat + 0.001, GENEVA.lng);
    const meta = diff2sFor(flush(), 'watcher').flatMap((d) => d.meta);
    expect(meta.map((m) => m.colour)).toEqual(['ultrared']);
  });

  it('costs a fraction of what the whole car state did', () => {
    hello('watcher', 'car-w');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    for (let i = 0; i < 20; i++) {
      hello(`k${i}`, `near${i}`);
      const at = destination(GENEVA.lat, GENEVA.lng, i * 18, 500 + i * 100);
      pos(`k${i}`, at.lat, at.lng);
    }
    now += SERVER_TICK_MS;
    flush();

    // A steady-state tick: everyone is known, everyone has moved.
    now += SERVER_TICK_MS;
    for (let i = 0; i < 20; i++) {
      const at = destination(GENEVA.lat, GENEVA.lng, i * 18, 520 + i * 100);
      pos(`k${i}`, at.lat, at.lng);
    }
    const steady = diff2sFor(flush(), 'watcher');
    const bytes = steady.reduce((n, d) => n + JSON.stringify(d).length, 0);
    expect(steady.flatMap((d) => d.upd)).toHaveLength(20);
    expect(steady.flatMap((d) => d.meta)).toEqual([]);
    // The old wire was about 210 bytes a car, so twenty of them was over four kilobytes.
    expect(bytes).toBeLessThan(1_200);
  });

  it('rounds a position to about a metre, and no further', () => {
    hello('a', 'car-a');
    hello('watcher', 'car-w');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    const car = wireOfCar(flush(), 'watcher', 'car-a');
    expect(car).toBeDefined();
    const lat = (car?.[1] ?? 0) / WIRE_COORD_SCALE;
    const lng = (car?.[2] ?? 0) / WIRE_COORD_SCALE;
    // Quantisation for bytes, an order of magnitude under a good GPS fix. This is not the
    // 50-100 m fuzz ADR-0024 removed: there is no offset and no direction to it.
    expect(haversineM(GENEVA.lat, GENEVA.lng, lat, lng)).toBeLessThan(2);
  });
});

describe('interest', () => {
  /*
   * A cell is about 27 x 19.5 km at this latitude, not the 39 km the equator would give, and
   * Geneva sits 13 km from its western edge. So a line of cars has to start at that edge to
   * stay inside one cell — which is the whole point: everything below must be interest doing
   * the filtering, never the cell subscription passing the test for the wrong reason.
   */
  const BOUNDS = decodeBounds(CELL);
  const WEST = { lat: (BOUNDS.minLat + BOUNDS.maxLat) / 2, lng: BOUNDS.minLng + 0.005 };

  /** `count` drivers strung out east of the cell's western edge, one every `spacingM`. */
  const line = (count: number, spacingM: number): void => {
    for (let i = 0; i < count; i++) {
      const at = destination(WEST.lat, WEST.lng, 90, (i + 1) * spacingM);
      hello(`k${i}`, `line${i}`, [encode(at.lat, at.lng, CELL_PRECISION)]);
      pos(`k${i}`, at.lat, at.lng);
    }
  };

  it('sends a driver only the cars near them, not the whole cell', () => {
    hello('watcher', 'car-w');
    pos('watcher', WEST.lat, WEST.lng);
    line(18, 1_000); // 1 km to 18 km east, all of it inside the one cell
    now += SERVER_TICK_MS;

    const seen = updIds(flush(), 'watcher');
    expect(seen.length).toBeGreaterThan(0);
    for (const id of seen) {
      const car = state.presence.get(id);
      expect(car).toBeDefined();
      expect(haversineM(WEST.lat, WEST.lng, car!.lat, car!.lng)).toBeLessThanOrEqual(
        INTEREST_RADIUS_M,
      );
    }
    // And the far one really is in the same cell.
    const far = state.presence.get(ID('line17'));
    expect(far?.cell).toBe(CELL);
    expect(seen).not.toContain(ID('line17'));
  });

  it('takes a car off your map once you have driven away from it', () => {
    hello('watcher', 'car-w');
    hello('a', 'car-a');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    pos('a', GENEVA.lat, GENEVA.lng);
    now += SERVER_TICK_MS;
    expect(updIds(flush(), 'watcher')).toContain(ID('car-a'));

    /*
     * The stationary car does not move and nothing about it changes. It is the watcher
     * driving away that puts it out of range, which is why interest has to be recomputed for
     * cars that are not in the tick's dirty set.
     *
     * Driven, not teleported: a jump would be refused as an impossible speed, and the
     * stationary car has to keep reporting or it would expire and the test would pass for
     * the wrong reason.
     */
    // 130 m every two seconds is 234 km/h: fast, and under the speed the hub refuses as
    // impossible. Reaching the drop radius takes about a hundred ticks at that.
    const gone: string[] = [];
    for (let i = 1; i <= 150 && gone.length === 0; i++) {
      now += SERVER_TICK_MS;
      const at = destination(GENEVA.lat, GENEVA.lng, 90, i * 130);
      pos('watcher', at.lat, at.lng, 234);
      pos('a', GENEVA.lat, GENEVA.lng, 0);
      gone.push(...goneIds(flush(), 'watcher'));
    }
    expect(gone).toContain(ID('car-a'));
    expect(state.presence.has(ID('car-a'))).toBe(true);
  });

  it('does not flicker a car sitting on the edge of range', () => {
    hello('watcher', 'car-w');
    hello('a', 'car-a');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    // Just inside, then a nudge either side of the line, as a real drive does constantly.
    const edge = destination(GENEVA.lat, GENEVA.lng, 90, INTEREST_RADIUS_M - 100);
    pos('a', edge.lat, edge.lng);
    now += SERVER_TICK_MS;
    expect(updIds(flush(), 'watcher')).toContain(ID('car-a'));

    const goneEvents: string[] = [];
    for (let i = 0; i < 6; i++) {
      now += SERVER_TICK_MS;
      const wobble = destination(GENEVA.lat, GENEVA.lng, 90, INTEREST_RADIUS_M + (i % 2 ? 200 : -200));
      pos('a', wobble.lat, wobble.lng);
      pos('watcher', GENEVA.lat, GENEVA.lng);
      goneEvents.push(...goneIds(flush(), 'watcher'));
    }
    // One threshold would have announced and withdrawn it every other tick.
    expect(goneEvents).toEqual([]);
  });

  it('serves a spectator their whole cell, because they have no position to measure from', () => {
    hello('watcher', 'car-w', [CELL], { spectator: true } as Partial<ClientMsg>);
    // 18 km east of the western edge: well beyond interest, well inside the cell.
    line(18, 1_000);
    now += SERVER_TICK_MS;
    // Someone who cannot be seen sends no positions, so there is nothing to centre their
    // interest on. They get what everyone got before this decision, which is what they had.
    expect(updIds(flush(), 'watcher')).toContain(ID('line17'));
  });

  it('scales with the cars near you, not with the cars in the cell', () => {
    hello('watcher', 'car-w');
    pos('watcher', GENEVA.lat, GENEVA.lng);
    // Two hundred drivers spread over the whole 39 km cell.
    for (let i = 0; i < 200; i++) {
      const at = destination(GENEVA.lat, GENEVA.lng, (i * 37) % 360, 200 + (i % 100) * 190);
      hello(`k${i}`, `crowd${i}`, [encode(at.lat, at.lng, CELL_PRECISION)]);
      pos(`k${i}`, at.lat, at.lng);
    }
    now += SERVER_TICK_MS;
    const out = flush();
    const seen = updIds(out, 'watcher');
    const bytes = diff2sFor(out, 'watcher').reduce((n, d) => n + JSON.stringify(d).length, 0);

    expect(state.presence.size).toBe(201);
    expect(seen.length).toBeLessThan(200);
    // The number that matters: the old wire would have put 200 x 210 bytes on this socket.
    expect(bytes).toBeLessThan(42_000 / 2);
  });
});
