import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POS_INTERVAL_STATIONARY_MS, PRESENCE_EXPIRY_MS } from '@teslawave/protocol';
import type { CarState, ServerMsg } from '@teslawave/protocol';
import {
  applyServerMsg,
  dropCells,
  getSummary,
  resetWorld,
  setSelfPlacement,
  setSelfReported,
  setSubscribedCells,
  tickWorld,
} from './world';

const GENEVA = { lat: 46.2044, lng: 6.1432 };

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

beforeEach(() => {
  resetWorld('me');
  setSelfPlacement({ lat: GENEVA.lat, lng: GENEVA.lng, heading: 90, speed: 50 });
  setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
});

describe('world', () => {
  it('renders a car that arrives in a snapshot', () => {
    applyServerMsg(welcome([car()]));
    const rendered = tickWorld(performance.now());
    expect(rendered.map((c) => c.id)).toEqual(['other']);
    expect(rendered[0]?.placement.lat).toBeCloseTo(GENEVA.lat, 4);
  });

  it('never renders your own car among the others', () => {
    applyServerMsg(welcome([car({ id: 'me' })]));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('drops a car the server says is gone', () => {
    applyServerMsg(welcome([car()]));
    applyServerMsg(diff({ gone: ['other'] }));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('expires a car that stopped reporting, without waiting for the server', () => {
    applyServerMsg(welcome([car({ ts: Date.now() - 61_000 })]));
    expect(tickWorld(performance.now())).toHaveLength(0);
  });

  it('measures distance from the position as sent, which is what the server validates', () => {
    // 500 m east of us: outside the 300 m prompt range.
    applyServerMsg(welcome([car({ lng: GENEVA.lng + 0.0065 })]));
    tickWorld(performance.now() + 1_000);
    expect(getSummary().nearby).toBeNull();

    resetWorld('me');
    setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
    applyServerMsg(welcome([car({ lng: GENEVA.lng + 0.0005 })]));
    // The summary is refreshed at most twice a second.
    tickWorld(performance.now() + 1_000);
    expect(getSummary().nearby?.id).toBe('other');
  });

  it('accumulates counters across the cells you are subscribed to', () => {
    setSubscribedCells(['u0hq', 'u0hr']);
    applyServerMsg(diff({ cell: 'u0hq', online: 3, wavesToday: 2 }));
    applyServerMsg(diff({ cell: 'u0hr', online: 4, wavesToday: 5 }));
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(7);
    expect(getSummary().wavesToday).toBe(7);
  });

  it('stops counting a cell once you have driven out of it', () => {
    setSubscribedCells(['u0hq', 'u0hr']);
    applyServerMsg(diff({ cell: 'u0hq', online: 3, wavesToday: 2 }));
    applyServerMsg(diff({ cell: 'u0hr', online: 4, wavesToday: 5 }));
    // Crossing a cell boundary: u0hr is behind us now. Its count used to stay in the total
    // for the rest of the drive, so "N online" only ever grew.
    setSubscribedCells(['u0hq', 'u0hx']);
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(3);
    expect(getSummary().wavesToday).toBe(2);
  });

  it('drops a reconnected cell\'s stale count instead of double-counting it', () => {
    setSubscribedCells(['u0hq']);
    applyServerMsg(diff({ cell: 'u0hq', online: 5, wavesToday: 1 }));
    tickWorld(performance.now() + 2_000);
    expect(getSummary().online).toBe(5);
    // A welcome means the hub is telling us the truth from scratch for these cells.
    applyServerMsg(welcome([]));
    tickWorld(performance.now() + 4_000);
    expect(getSummary().online).toBe(0);
  });

  it('forgets the cells of a hub socket that went away', () => {
    setSubscribedCells(['u0hq']);
    applyServerMsg(welcome([car()]));
    applyServerMsg(diff({ online: 5 }));
    dropCells(['u0hq']);
    tickWorld(performance.now() + 4_000);
    expect(getSummary().online).toBe(0);
    expect(tickWorld(performance.now() + 4_000)).toHaveLength(0);
  });
});

describe('cells and reconnects', () => {
  it('keeps a car that crossed into another cell when the old cell says it is gone', () => {
    applyServerMsg(welcome([car({ cell: 'u0hq' })]));
    // The hub announces the crossing as an update in the new cell followed by a departure
    // from the old one. The departure is old news, not a car leaving.
    applyServerMsg(diff({ cell: 'u0hr', upd: [car({ cell: 'u0hr', ts: Date.now() + 2_000 })] }));
    applyServerMsg(diff({ cell: 'u0hq', gone: ['other'] }));
    expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['other']);
    // A departure from the cell the car is actually in still counts.
    applyServerMsg(diff({ cell: 'u0hr', gone: ['other'] }));
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
      applyServerMsg(welcome([car({ id: 'stayed' }), car({ id: 'left' })]));
      expect(tickWorld(performance.now())).toHaveLength(2);
      // Reconnected: the hub restates the cell, and only one of them is in the snapshot.
      applyServerMsg(welcome([car({ id: 'stayed' })]));
      // Not gone yet: the hub may have just woken up and be waiting for them too.
      expect(tickWorld(performance.now()).map((c) => c.id).sort()).toEqual(['left', 'stayed']);
      vi.advanceTimersByTime(POS_INTERVAL_STATIONARY_MS + 1_000);
      applyServerMsg(diff({ upd: [car({ id: 'stayed' })] }));
      expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['stayed']);
    });

    it('keeps them when the woken hub hears from them again in time', () => {
      applyServerMsg(welcome([car({ id: 'parked' })]));
      // The hub hibernated and our reconnect woke it: it has forgotten everyone for now.
      applyServerMsg(welcome([]));
      vi.advanceTimersByTime(POS_INTERVAL_STATIONARY_MS - 5_000);
      applyServerMsg(diff({ upd: [car({ id: 'parked', speed: 0 })] }));
      vi.advanceTimersByTime(PRESENCE_EXPIRY_MS - 5_000);
      expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['parked']);
    });

    it('does not push back someone who was already older than that', () => {
      applyServerMsg(welcome([car({ id: 'old', ts: Date.now() - (PRESENCE_EXPIRY_MS - 5_000) })]));
      applyServerMsg(welcome([]));
      vi.advanceTimersByTime(6_000);
      expect(tickWorld(performance.now())).toHaveLength(0);
    });
  });

  it('leaves cars in other cells alone on a welcome', () => {
    applyServerMsg(welcome([car({ id: 'here' })]));
    applyServerMsg(diff({ cell: 'u0hr', upd: [car({ id: 'there', cell: 'u0hr' })] }));
    applyServerMsg(welcome([car({ id: 'here' })]));
    expect(tickWorld(performance.now()).map((c) => c.id).sort()).toEqual(['here', 'there']);
  });

});
