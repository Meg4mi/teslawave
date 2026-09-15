import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CELL_PRECISION,
  POS_INTERVAL_STATIONARY_MS,
  PRESENCE_EXPIRY_MS,
  REPORT_MAX_LIFE_MS,
  REPORT_TTL_MS,
  WIRE_COORD_SCALE,
  decodeBounds,
  destination,
  encode,
} from '@teslawave/protocol';
import type { CarMeta, CarState, CarWire, ServerMsg } from '@teslawave/protocol';
import {
  applyServerMsg,
  dropCells,
  getCar,
  getSummary,
  reportsNow,
  resetWorld,
  setSelfPlacement,
  setSelfReported,
  setSubscribedCells,
  tickWorld,
} from './world';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
/** Every message arrives on some connection; which one matters on the compact wire. */
const HUB = 'u0';
const apply = (msg: ServerMsg): void => applyServerMsg(msg, HUB);

const car = (over: Partial<CarState> = {}): CarState => ({
  id: 'other',
  model: 'Y',
  colour: 'deepblue',
  waves: 2,
  since: Date.now() - 60_000,
  lat: GENEVA.lat,
  lng: GENEVA.lng,
  heading: 90,
  speed: 50,
  ts: Date.now(),
  cell: 'u0hq',
  ...over,
});

const welcome = (snapshot: CarState[]): ServerMsg => ({
  t: 'welcome',
  now: Date.now(),
  you: null,
  cells: ['u0hq'],
  snapshot,
});

const diff = (over: Partial<Extract<ServerMsg, { t: 'diff' }>> = {}): ServerMsg => ({
  t: 'diff',
  cell: 'u0hq',
  upd: [],
  gone: [],
  online: 1,
  wavesToday: 0,
  lastWaveTs: null,
  ...over,
});

const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
/** The cell over CELL's northern edge. */
const NORTH_EDGE = decodeBounds(CELL).maxLat;
const NORTH_CELL = encode(NORTH_EDGE + 0.01, GENEVA.lng, CELL_PRECISION);

const meta = (h: number, id: string, cell: string): CarMeta => ({
  h,
  id,
  model: 'Y',
  colour: 'deepblue',
  since: 0,
  cell,
});
const wire = (h: number, lat: number, lng: number, age = 0): CarWire => [
  h,
  Math.round(lat * WIRE_COORD_SCALE),
  Math.round(lng * WIRE_COORD_SCALE),
  0,
  0,
  0,
  age,
];
const diff2 = (
  cell: string,
  over: Partial<Extract<ServerMsg, { t: 'diff2' }>> = {},
): ServerMsg => ({
  t: 'diff2',
  cell,
  now: Date.now(),
  meta: [],
  upd: [],
  gone: [],
  online: 1,
  wavesToday: 0,
  lastWaveTs: null,
  ...over,
});

beforeEach(() => {
  resetWorld('me');
  setSelfPlacement({ lat: GENEVA.lat, lng: GENEVA.lng, heading: 90, speed: 50 });
  setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
});

describe('world', () => {
  it('renders a car that arrives in a snapshot', () => {
    apply(welcome([car()]));
    const rendered = tickWorld(performance.now());
    expect(rendered.map((c) => c.id)).toEqual(['other']);
    expect(rendered[0]?.placement.lat).toBeCloseTo(GENEVA.lat, 4);
  });

  it('never renders your own car among the others', () => {
    apply(welcome([car({ id: 'me' })]));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('drops a car the server says is gone', () => {
    apply(welcome([car()]));
    apply(diff({ gone: ['other'] }));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('expires a car that stopped reporting, without waiting for the server', () => {
    apply(welcome([car({ ts: Date.now() - 61_000 })]));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('measures distance from the position as sent, which is what the server validates', () => {
    // 500 m east of us: outside the 300 m prompt range.
    apply(welcome([car({ lng: GENEVA.lng + 0.0065 })]));
    tickWorld(performance.now() + 1_000);
    expect(getSummary().nearby).toBeNull();

    resetWorld('me');
    setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
    apply(welcome([car({ lng: GENEVA.lng + 0.0005 })]));
    // The summary is refreshed at most twice a second.
    tickWorld(performance.now() + 1_000);
    expect(getSummary().nearby?.id).toBe('other');
  });

  it('keeps offering the car it offered until the hub would refuse the wave', () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      // Stopped, so nothing dead-reckons: the distances below are the ones measured.
      const at = (metres: number): Partial<CarState> => ({
        ...destination(GENEVA.lat, GENEVA.lng, 90, metres),
        speed: 0,
      });
      apply(welcome([car({ ...at(250), ts: start })]));
      tickWorld(1_000);
      expect(getSummary().nearby?.id).toBe('other');

      // Past the prompt range, still inside the range a wave is accepted at.
      vi.setSystemTime(start + 5_000);
      apply(diff({ upd: [car({ ...at(400), ts: start + 5_000 })] }));
      vi.setSystemTime(start + 8_000);
      tickWorld(2_000);
      expect(getSummary().nearby?.id, 'the offer used to vanish a metre past 300').toBe('other');

      // A car inside the prompt range takes the offer over from one that is only kept.
      apply(diff({ upd: [car({ ...at(100), id: 'closer', ts: start + 8_000 })] }));
      vi.setSystemTime(start + 11_000);
      tickWorld(3_000);
      expect(getSummary().nearby?.id).toBe('closer');

      // And the hub's own limit is where the offer ends.
      apply(diff({ gone: ['closer'] }));
      apply(diff({ upd: [car({ ...at(500), ts: start + 11_000 })] }));
      vi.setSystemTime(start + 14_000);
      tickWorld(4_000);
      expect(getSummary().nearby).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accumulates counters across the cells you are subscribed to', () => {
    setSubscribedCells(['u0hq', 'u0hr']);
    apply(diff({ cell: 'u0hq', online: 3, wavesToday: 2 }));
    apply(diff({ cell: 'u0hr', online: 4, wavesToday: 5 }));
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(7);
    expect(getSummary().wavesToday).toBe(7);
  });

  it('stops counting a cell once you have driven out of it', () => {
    setSubscribedCells(['u0hq', 'u0hr']);
    apply(diff({ cell: 'u0hq', online: 3, wavesToday: 2 }));
    apply(diff({ cell: 'u0hr', online: 4, wavesToday: 5 }));
    // Crossing a cell boundary: u0hr is behind us now. Its count used to stay in the total
    // for the rest of the drive, so "N online" only ever grew.
    setSubscribedCells(['u0hq', 'u0hx']);
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(3);
    expect(getSummary().wavesToday).toBe(2);
  });

  it('drops a reconnected cell\'s stale count instead of double-counting it', () => {
    setSubscribedCells(['u0hq']);
    apply(diff({ cell: 'u0hq', online: 5, wavesToday: 1 }));
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(5);
    // A welcome means the hub is telling us the truth from scratch for these cells.
    apply(welcome([]));
    tickWorld(performance.now() + 4_000);
    expect(getSummary().online).toBe(0);
  });

  it('forgets the cells of a hub socket that went away', () => {
    setSubscribedCells(['u0hq']);
    apply(welcome([car()]));
    apply(diff({ online: 5 }));
    dropCells(['u0hq']);
    tickWorld(performance.now() + 4_000);
    expect(getSummary().online).toBe(0);
    expect(tickWorld(performance.now() + 4_000)).toHaveLength(0);
  });
});

describe('letting go of a cell', () => {
  const inCell = { lat: NORTH_EDGE - 0.02, lng: GENEVA.lng };
  const north = { lat: NORTH_EDGE + 0.02, lng: GENEVA.lng };

  it('keeps hearing the cars in the cells it still holds', () => {
    setSubscribedCells([CELL, NORTH_CELL]);
    apply(
      diff2(CELL, {
        meta: [meta(1, 'behind', CELL), meta(2, 'beside', NORTH_CELL)],
        upd: [wire(1, inCell.lat, inCell.lng), wire(2, north.lat, north.lng)],
      }),
    );
    expect(tickWorld(1_000)).toHaveLength(2);

    // We drove on: the cell behind us left the set, the one we are in did not.
    dropCells([CELL], HUB);
    setSubscribedCells([NORTH_CELL]);
    expect(getCar('behind')).toBeUndefined();
    expect(getCar('beside')).toBeDefined();

    // The hub still refers to the car beside us by the handle it gave. That used to fall on
    // deaf ears: every handle on the hub had been forgotten, and the car froze.
    const later = Date.now() + 2_000;
    const moved = destination(north.lat, north.lng, 90, 30);
    apply(diff2(NORTH_CELL, { now: later, upd: [wire(2, moved.lat, moved.lng)] }));
    expect(getCar('beside')?.lastServerTs).toBe(later);
  });

  it('judges a car by where it is now, not by the cell it was first met in', () => {
    setSubscribedCells([CELL, NORTH_CELL]);
    // Described in CELL, then driven north across the edge as six numbers a tick.
    apply(diff2(CELL, { meta: [meta(1, 'companion', CELL)], upd: [wire(1, inCell.lat, inCell.lng)] }));
    apply(diff2(NORTH_CELL, { now: Date.now() + 2_000, upd: [wire(1, north.lat, north.lng)] }));
    expect(getCar('companion')?.cell).toBe(NORTH_CELL);

    // The cell we met in falls behind us. The companion is not in it any more.
    dropCells([CELL], HUB);
    expect(getCar('companion'), 'deleted for the cell it was described in').toBeDefined();

    dropCells([NORTH_CELL], HUB);
    expect(getCar('companion')).toBeUndefined();
  });
});

describe('cells and reconnects', () => {
  it('keeps a car that crossed into another cell when the old cell says it is gone', () => {
    apply(welcome([car({ cell: 'u0hq' })]));
    // The hub announces the crossing as an update in the new cell followed by a departure
    // from the old one. The departure is old news, not a car leaving.
    apply(diff({ cell: 'u0hr', upd: [car({ cell: 'u0hr', ts: Date.now() + 2_000 })] }));
    apply(diff({ cell: 'u0hq', gone: ['other'] }));
    expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['other']);
    // A departure from the cell the car is actually in still counts.
    apply(diff({ cell: 'u0hr', gone: ['other'] }));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  describe('a welcome that does not mention someone we hold', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('forgets them once they have missed the report a stopped car would have sent', () => {
      apply(welcome([car({ id: 'stayed' }), car({ id: 'left' })]));
      expect(tickWorld(performance.now())).toHaveLength(2);
      // Reconnected: the hub restates the cell, and only one of them is in the snapshot.
      apply(welcome([car({ id: 'stayed' })]));
      // Not gone yet: the hub may have just woken up and be waiting for them too.
      expect(tickWorld(performance.now()).map((c) => c.id).sort()).toEqual(['left', 'stayed']);
      vi.advanceTimersByTime(POS_INTERVAL_STATIONARY_MS + 1_000);
      apply(diff({ upd: [car({ id: 'stayed' })] }));
      expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['stayed']);
    });

    it('keeps them when the woken hub hears from them again in time', () => {
      apply(welcome([car({ id: 'parked' })]));
      // The hub hibernated and our reconnect woke it: it has forgotten everyone for now.
      apply(welcome([]));
      vi.advanceTimersByTime(POS_INTERVAL_STATIONARY_MS - 5_000);
      apply(diff({ upd: [car({ id: 'parked', speed: 0 })] }));
      vi.advanceTimersByTime(PRESENCE_EXPIRY_MS - 5_000);
      expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['parked']);
    });

    it('does not push back someone who was already older than that', () => {
      apply(welcome([car({ id: 'old', ts: Date.now() - (PRESENCE_EXPIRY_MS - 5_000) })]));
      apply(welcome([]));
      vi.advanceTimersByTime(6_000);
      expect(tickWorld(performance.now())).toHaveLength(0);
    });
  });

  it('leaves cars in other cells alone on a welcome', () => {
    apply(welcome([car({ id: 'here' })]));
    apply(diff({ cell: 'u0hr', upd: [car({ id: 'there', cell: 'u0hr' })] }));
    apply(welcome([car({ id: 'here' })]));
    expect(tickWorld(performance.now()).map((c) => c.id).sort()).toEqual(['here', 'there']);
  });

});

describe('reports', () => {
  const report = (
    over: Partial<Extract<ServerMsg, { t: 'reports' }>['upd'][number]> = {},
  ): Extract<ServerMsg, { t: 'reports' }>['upd'][number] => {
    const at = Date.now();
    return { id: 'u0-r1', kind: 'police', lat: GENEVA.lat, lng: GENEVA.lng + 0.005, at, first: at, n: 1, no: 0, ...over };
  };
  const reportsMsg = (upd: ReturnType<typeof report>[] = [], gone: string[] = []): ServerMsg => ({
    t: 'reports',
    cell: 'u0hq',
    upd,
    gone,
  });

  it('holds a report the hub sends, with its distance from the car', () => {
    apply(reportsMsg([report()]));
    const [r] = reportsNow();
    expect(r?.kind).toBe('police');
    // ~385 m east of Geneva at this latitude.
    expect(r?.distanceM).toBeGreaterThan(300);
    expect(r?.distanceM).toBeLessThan(500);
  });

  it('raises the alert for the nearest report within range, and only that one', () => {
    apply(reportsMsg([report(), report({ id: 'u0-r2', kind: 'accident', lng: GENEVA.lng + 0.002 })]));
    tickWorld(performance.now() + 1_000);
    expect(getSummary().alert).toMatchObject({ id: 'u0-r2', kind: 'accident', n: 1 });

    // Twelve kilometres away: on the map, but nothing to say.
    resetWorld('me');
    setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
    apply(reportsMsg([report({ lng: GENEVA.lng + 0.15 })]));
    tickWorld(performance.now() + 2_000);
    expect(reportsNow()).toHaveLength(1);
    expect(getSummary().alert).toBeNull();
  });

  it('keeps a confirmed report as the same pin, with a bigger number', () => {
    apply(reportsMsg([report()]));
    const first = reportsNow()[0]?.appearedAt;
    apply(reportsMsg([report({ n: 3, at: Date.now() + 60_000 })]));
    expect(reportsNow()).toHaveLength(1);
    expect(reportsNow()[0]?.n).toBe(3);
    // The entry ring is not played again for a pin that was already there.
    expect(reportsNow()[0]?.appearedAt).toBe(first);
  });

  it('drops a report the hub says is gone, and one the cell it is in is let go of', () => {
    apply(reportsMsg([report(), report({ id: 'u0-r2' })]));
    apply(reportsMsg([], ['u0-r1']));
    expect(reportsNow().map((r) => r.id)).toEqual(['u0-r2']);
    dropCells(['u0hq'], HUB);
    expect(reportsNow()).toHaveLength(0);
  });

  it('lets a report lapse on its own clock, hub or no hub', () => {
    const old = Date.now() - (REPORT_TTL_MS.police + 60_000);
    apply(reportsMsg([report({ at: old, first: old })]));
    expect(reportsNow()).toHaveLength(1);
    tickWorld(performance.now());
    expect(reportsNow()).toHaveLength(0);
    // A patrol confirmed a moment ago outlives an accident reported at the same time.
    const hourAgo = Date.now() - 61 * 60_000;
    apply(reportsMsg([report({ id: 'u0-r3', at: hourAgo, first: hourAgo })]));
    apply(reportsMsg([report({ id: 'u0-r4', kind: 'accident', at: hourAgo, first: hourAgo })]));
    tickWorld(performance.now());
    expect(reportsNow().map((r) => r.id)).toEqual(['u0-r3']);
  });

  it('lets a pin go at the ceiling however lately it was confirmed', () => {
    // Placed four hours ago, confirmed a minute ago: the kind's own clock would keep it, and
    // the ceiling is what answers (ADR-0040, amended).
    apply(
      reportsMsg([
        report({ at: Date.now() - 60_000, first: Date.now() - (REPORT_MAX_LIFE_MS + 60_000) }),
      ]),
    );
    tickWorld(performance.now());
    expect(reportsNow()).toHaveLength(0);
  });

  it('carries how many drivers say a pin is gone', () => {
    apply(reportsMsg([report({ n: 3, no: 1 })]));
    expect(reportsNow()[0]).toMatchObject({ n: 3, no: 1 });
  });

  it('carries a status on a car, from either wire', () => {
    apply(welcome([car({ status: 'roadtrip' })]));
    expect(getCar('other')?.status).toBe('roadtrip');
    apply(diff2('u0hq', { meta: [{ ...meta(1, 'other', 'u0hq'), status: 'charging' }], upd: [wire(1, GENEVA.lat, GENEVA.lng)] }));
    expect(getCar('other')?.status).toBe('charging');
    // Cleared when the driver clears it: rebuilt, not patched.
    apply(diff2('u0hq', { meta: [meta(1, 'other', 'u0hq')], upd: [wire(1, GENEVA.lat, GENEVA.lng)] }));
    expect(getCar('other')).not.toHaveProperty('status');
  });
});
