import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARKED_HIDE_MS,
  POS_INTERVAL_STATIONARY_MS,
  PRESENCE_EXPIRY_MS,
  type ClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';
import { decodeBounds } from '@teslawave/protocol';
import { createNet, type Net } from './sockets';

/**
 * These cover the reconnect story the app is actually judged on: a car going through a tunnel
 * and a phone going in a pocket. Both used to leave the driver invisible to everyone else and
 * the "N online" counter stuck on a number from ten minutes ago.
 */
class FakeSocket {
  static open: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.open.push(this);
  }

  connect(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** The half-dead socket: the browser froze it, so no close event ever arrives. */
  freeze(): void {
    this.onclose = null;
  }

  msgs(): ClientMsg[] {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s) as ClientMsg);
  }
}

const PROFILE = { secret: 'secret-me-0123456789', model: '3', colour: 'red', spectator: false } as const;
const GENEVA = { lat: 46.2044, lng: 6.1432, heading: 90, speed: 50 };

describe('net', () => {
  let net: Net;
  let cells: string[][];
  let messages: ServerMsg[];
  let parkedEvents: boolean[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.open = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    cells = [];
    messages = [];
    parkedEvents = [];
    net = createNet({
      onMessage: (m) => messages.push(m),
      onStatus: () => undefined,
      onCellsDropped: () => undefined,
      onCells: (c) => cells.push(c),
      onParked: (p) => parkedEvents.push(p),
    });
    net.start({ ...PROFILE });
  });

  afterEach(() => {
    net.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const only = (): FakeSocket => {
    const ws = FakeSocket.open.at(-1);
    if (!ws) throw new Error('no socket was opened');
    return ws;
  };

  it('reports the cells it actually holds a socket for', () => {
    net.update(GENEVA);
    expect(cells.at(-1)?.length).toBeGreaterThan(0);
    // Every reported cell belongs to the hub we connected to.
    const hub = new URL(only().url, 'https://x').searchParams.get('hub');
    for (const cell of cells.at(-1) ?? []) expect(cell.slice(0, 2)).toBe(hub);
  });

  it('says where it is as soon as a socket opens, without waiting for the send policy', () => {
    net.update(GENEVA);
    const ws = only();
    ws.connect();
    const kinds = ws.msgs().map((m) => m.t);
    expect(kinds).toEqual(['hello', 'pos']);
  });

  it('replaces a socket the browser froze when the tab comes back', () => {
    net.update(GENEVA);
    const stale = only();
    stale.connect();
    stale.freeze();

    // A minute in a pocket: nothing arrived, but the socket still claims to be open.
    vi.advanceTimersByTime(70_000);
    // jsdom reports the document as visible, which is the state we are testing for.
    document.dispatchEvent(new Event('visibilitychange'));

    const fresh = only();
    expect(fresh).not.toBe(stale);
    expect(stale.readyState).toBe(FakeSocket.CLOSED);

    fresh.connect();
    expect(fresh.msgs().map((m) => m.t)).toEqual(['hello', 'pos']);
  });

  it('leaves a healthy socket alone when the tab comes back', () => {
    net.update(GENEVA);
    const ws = only();
    ws.connect();
    ws.onmessage?.({ data: JSON.stringify({ t: 'welcome', now: Date.now(), you: null, cells: [], snapshot: [] }) });

    document.dispatchEvent(new Event('visibilitychange'));
    expect(only()).toBe(ws);
    expect(messages).toHaveLength(1);
  });

  it('forgets its cells when it stops, so nothing is counted while offline', () => {
    net.update(GENEVA);
    only().connect();
    net.stop();
    expect(cells.at(-1)).toEqual([]);
  });

  const posTimes = (ws: FakeSocket): number[] =>
    ws.msgs().flatMap((m) => (m.t === 'pos' ? [m.ts] : []));

  it('keeps the hub fed when the device stops delivering fixes', () => {
    net.update({ ...GENEVA, speed: 0 });
    const ws = only();
    ws.connect();
    // A parked car whose watchPosition goes quiet, for two minutes. The socket is fine: the
    // hub keeps answering our pings, which is the only thing it hears.
    for (let s = 0; s < 24; s++) {
      vi.advanceTimersByTime(5_000);
      ws.onmessage?.({ data: 'pong' });
    }
    expect(only()).toBe(ws);
    const times = posTimes(ws);
    expect(times.length).toBeGreaterThanOrEqual(4);
    // The hub evicts at PRESENCE_EXPIRY_MS: no gap may come anywhere near it.
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] ?? 0) - (times[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(POS_INTERVAL_STATIONARY_MS);
      expect(gap).toBeLessThan(PRESENCE_EXPIRY_MS / 1.5);
    }
  });

  it('sends nothing extra while fixes are still arriving', () => {
    net.update({ ...GENEVA, speed: 0 });
    const ws = only();
    ws.connect();
    // One fix a second for a minute, like a real device sitting at a light.
    for (let s = 0; s < 65; s++) {
      vi.advanceTimersByTime(1_000);
      net.update({ ...GENEVA, speed: 0 });
    }
    // The send policy alone would have said: at 0 s, 30 s and 60 s. Nothing more.
    expect(posTimes(ws)).toHaveLength(3);
  });

  it('sends a wave to the one hub that owns the target, and everything else to all', () => {
    // A car 500 m inside the northern edge of hub u0 subscribes to cells in two hubs.
    const edge = decodeBounds('u0').maxLat;
    net.update({ ...GENEVA, lat: edge - 0.0045 });
    expect(FakeSocket.open).toHaveLength(2);
    for (const ws of FakeSocket.open) ws.connect();
    const hubOfSocket = (ws: FakeSocket): string =>
      new URL(ws.url, 'https://x').searchParams.get('hub') ?? '';
    const [first, second] = FakeSocket.open as [FakeSocket, FakeSocket];
    expect(hubOfSocket(first)).not.toBe(hubOfSocket(second));

    expect(net.send({ t: 'wave', to: 'x'.repeat(32) }, hubOfSocket(second))).toBe(true);
    expect(first.msgs().filter((m) => m.t === 'wave')).toHaveLength(0);
    expect(second.msgs().filter((m) => m.t === 'wave')).toHaveLength(1);

    expect(net.send({ t: 'hide' })).toBe(true);
    expect(first.msgs().filter((m) => m.t === 'hide')).toHaveLength(1);
    expect(second.msgs().filter((m) => m.t === 'hide')).toHaveLength(1);

    // A hub we hold no socket for cannot take a wave, and the caller is told so.
    expect(net.send({ t: 'wave', to: 'x'.repeat(32) }, 'zz')).toBe(false);
  });

  it('hides a car parked for PARKED_HIDE_MS, whether or not fixes keep coming', () => {
    net.update({ ...GENEVA, speed: 0 });
    const ws = only();
    ws.connect();
    // Fixes for the first half, then the device goes quiet, as a parked car's does.
    for (let s = 0; s < PARKED_HIDE_MS / 2 / 1_000; s++) {
      vi.advanceTimersByTime(1_000);
      ws.onmessage?.({ data: 'pong' });
      net.update({ ...GENEVA, speed: 0 });
    }
    expect(parkedEvents).toEqual([]);
    // The hub keeps answering pings, which is all it hears from a quiet device.
    const wait = (ms: number): void => {
      for (let t = 0; t < ms; t += 5_000) {
        vi.advanceTimersByTime(5_000);
        ws.onmessage?.({ data: 'pong' });
      }
    };
    wait(PARKED_HIDE_MS / 2 + 5_000);
    expect(parkedEvents).toEqual([true]);
    expect(only()).toBe(ws);
    const kinds = ws.msgs().map((m) => m.t);
    expect(kinds.at(-1)).toBe('hide');

    // Parked: nothing goes out, however long it sits there.
    const before = posTimes(ws).length;
    wait(30 * 60_000);
    expect(posTimes(ws)).toHaveLength(before);
    // A fix that arrives while parked does not leak the position either.
    expect(net.update({ ...GENEVA, speed: 0 })).toBe(false);
    expect(posTimes(ws)).toHaveLength(before);

    // Moving again: back on the map at once, in that order.
    expect(net.update({ ...GENEVA, speed: 30 })).toBe(true);
    expect(parkedEvents).toEqual([true, false]);
    const tail = ws.msgs().map((m) => m.t).slice(-2);
    expect(tail).toEqual(['show', 'pos']);
  });

  it('does not count a red light as parking', () => {
    net.update({ ...GENEVA, speed: 50 });
    const ws = only();
    ws.connect();
    for (let s = 0; s < 120; s++) {
      vi.advanceTimersByTime(1_000);
      net.update({ ...GENEVA, speed: 0 });
    }
    net.update({ ...GENEVA, speed: 30 });
    vi.advanceTimersByTime(PARKED_HIDE_MS);
    expect(parkedEvents).toEqual([]);
    expect(ws.msgs().some((m) => m.t === 'hide')).toBe(false);
  });

  it('tells a fresh socket it is hidden, so a reconnect cannot unhide a parked car', () => {
    net.update({ ...GENEVA, speed: 0 });
    const first = only();
    first.connect();
    vi.advanceTimersByTime(PARKED_HIDE_MS + 5_000);
    expect(parkedEvents).toEqual([true]);
    first.freeze();
    vi.advanceTimersByTime(70_000);
    document.dispatchEvent(new Event('visibilitychange'));
    const fresh = only();
    expect(fresh).not.toBe(first);
    fresh.connect();
    expect(fresh.msgs().map((m) => m.t)).toEqual(['hello', 'hide']);
  });

  it('stays quiet while invisible, even when no fixes arrive', () => {
    net.update(GENEVA);
    const ws = only();
    ws.connect();
    net.setHidden(true);
    vi.advanceTimersByTime(120_000);
    expect(posTimes(ws)).toHaveLength(1);
  });
});
