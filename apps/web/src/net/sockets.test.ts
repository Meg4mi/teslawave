import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, ServerMsg } from '@teslawave/protocol';
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

const PROFILE = { id: 'me', model: '3', colour: 'red', spectator: false } as const;
const GENEVA = { lat: 46.2044, lng: 6.1432, heading: 90, speed: 50 };

describe('net', () => {
  let net: Net;
  let cells: string[][];
  let messages: ServerMsg[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.open = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    cells = [];
    messages = [];
    net = createNet({
      onMessage: (m) => messages.push(m),
      onStatus: () => undefined,
      onCellsDropped: () => undefined,
      onCells: (c) => cells.push(c),
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
});
