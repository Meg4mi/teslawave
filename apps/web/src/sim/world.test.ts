import { beforeEach, describe, expect, it } from 'vitest';
import type { CarState, ServerMsg } from '@teslawave/protocol';
import {
  applyServerMsg,
  dropCells,
  getSummary,
  resetWorld,
  setDisplayOffsetSource,
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
  setDisplayOffsetSource(null);
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

  it('draws a car where the display nudge puts it, and measures it where the server does', () => {
    setSelfReported({ lat: GENEVA.lat, lng: GENEVA.lng });
    // 500 m east: too far to wave at.
    applyServerMsg(welcome([car({ lng: GENEVA.lng + 0.0065 })]));
    const before = tickWorld(performance.now() + 1_000)[0];
    expect(before?.distanceM).toBeGreaterThan(400);

    // Now nudge it onto a road 80 m north. The sprite moves; the distance must not, or the
    // wave button would appear for a wave the hub is going to refuse.
    setDisplayOffsetSource(() => ({ lat: 0.0007, lng: 0 }));
    const after = tickWorld(performance.now() + 1_100)[0];
    expect(after?.placement.lat).toBeCloseTo((before?.placement.lat ?? 0) + 0.0007, 6);
    expect(after?.reported.lat).toBeCloseTo(before?.placement.lat ?? 0, 6);
    expect(after?.distanceM).toBeCloseTo(before?.distanceM ?? 0, 0);
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

  it('forgets, on a welcome, anyone who left the cell while the socket was down', () => {
    applyServerMsg(welcome([car({ id: 'stayed' }), car({ id: 'left' })]));
    expect(tickWorld(performance.now())).toHaveLength(2);
    // Reconnected: the hub restates the cell from scratch, and only one of them is still there.
    applyServerMsg(welcome([car({ id: 'stayed' })]));
    expect(tickWorld(performance.now()).map((c) => c.id)).toEqual(['stayed']);
  });

  it('leaves cars in other cells alone on a welcome', () => {
    applyServerMsg(welcome([car({ id: 'here' })]));
    applyServerMsg(diff({ cell: 'u0hr', upd: [car({ id: 'there', cell: 'u0hr' })] }));
    applyServerMsg(welcome([car({ id: 'here' })]));
    expect(tickWorld(performance.now()).map((c) => c.id).sort()).toEqual(['here', 'there']);
  });

  it('turns a snapped car to lie along its road, for the drawing only', () => {
    applyServerMsg(welcome([car({ heading: 350 })]));
    setDisplayOffsetSource(() => ({ lat: 0, lng: 0, turn: 15 }));
    const rendered = tickWorld(performance.now())[0];
    expect(rendered?.placement.heading).toBeCloseTo(5, 6);
    expect(rendered?.reported.heading).toBe(350);
  });
});
