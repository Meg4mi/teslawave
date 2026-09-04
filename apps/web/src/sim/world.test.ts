import { beforeEach, describe, expect, it } from 'vitest';
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

  it('measures distance from the fuzzed position, which is what the server validates', () => {
    // 500 m east of us: outside the 150 m prompt range.
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
