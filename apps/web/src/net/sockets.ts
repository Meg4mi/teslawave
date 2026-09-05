import {
  CELL_PRECISION,
  MAX_SOCKETS_PER_CLIENT,
  NEIGHBOUR_RADIUS_M,
  POS_INTERVAL_STATIONARY_MS,
  cellsWithin,
  groupByHub,
  parseServerMsg,
  shouldSendPos,
  type ClientMsg,
  type CarColourId,
  type SentPos,
  type ServerMsg,
  type TeslaModel,
} from '@teslawave/protocol';
import { wsUrl } from '../config/env';

export type NetStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'budget' | 'paused';

export type NetProfile = {
  id: string;
  model: TeslaModel;
  colour: CarColourId;
  nick?: string;
  spectator: boolean;
};

type Hub = {
  hub: string;
  cells: string[];
  ws: WebSocket | null;
  attempts: number;
  retry: number | null;
  keepalive: number | null;
  lastInbound: number;
  helloSent: boolean;
};

export type Net = {
  start: (profile: NetProfile) => void;
  stop: () => void;
  /** Feed it an already fuzzed position. Returns true if a position was actually sent. */
  update: (fuzzed: { lat: number; lng: number; heading: number; speed: number }) => boolean;
  send: (msg: ClientMsg) => void;
  setHidden: (hidden: boolean) => void;
  setProfile: (profile: NetProfile) => void;
  status: () => NetStatus;
};

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
const PROBE_AFTER_ATTEMPTS = 2;
const KEEPALIVE_MS = 25_000;
const STALE_MS = 60_000;
/**
 * How often we check that the hub has heard from us lately. The hub forgets a driver 60 s
 * after their last position and a stopped car reports every 30 s, so the check has to run
 * a few times inside that window, not once.
 */
const FEED_CHECK_MS = 5_000;

/**
 * Why a socket will not open. The Worker answers 503 when the kill switch is off and 429
 * once the day's free request budget is gone; a plain GET to /ws (no Upgrade header) gets
 * 426 when everything is fine, which costs one request and tells us which message to show.
 */
export async function probeAvailability(): Promise<NetStatus | null> {
  try {
    const res = await fetch('/ws?hub=zz', { method: 'GET' });
    if (res.status === 429) return 'budget';
    if (res.status === 503) return 'paused';
    return null;
  } catch {
    return null;
  }
}

export function createNet(handlers: {
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: NetStatus) => void;
  onCellsDropped: (cells: string[]) => void;
  /** The full set of cells we are subscribed to right now, whenever it changes. */
  onCells: (cells: string[]) => void;
}): Net {
  const hubs = new Map<string, Hub>();
  let profile: NetProfile | null = null;
  let hidden = false;
  let lastSent: SentPos | null = null;
  /** The last position we were given, so a reconnected socket can say where we are at once. */
  let lastFuzzed: { lat: number; lng: number; heading: number; speed: number } | null = null;
  let status: NetStatus = 'idle';
  let running = false;
  let subscribed: string[] = [];
  let feed: number | null = null;
  /**
   * When a position last went out on any socket. Separate from `lastSent`, which is the send
   * policy's memory and is cleared on purpose by `wake` so the next fix goes straight out.
   */
  let lastSentAt = 0;

  const setStatus = (next: NetStatus): void => {
    if (status === next) return;
    status = next;
    handlers.onStatus(next);
  };

  const refreshStatus = (): void => {
    if (!running) return setStatus('idle');
    if (status === 'budget' || status === 'paused') return;
    const open = [...hubs.values()].some((h) => h.ws?.readyState === WebSocket.OPEN);
    setStatus(open ? 'live' : hubs.size === 0 ? 'connecting' : 'reconnecting');
  };

  const helloFor = (hub: Hub): ClientMsg | null => {
    if (!profile) return null;
    return {
      t: 'hello',
      id: profile.id,
      model: profile.model,
      colour: profile.colour,
      cells: hub.cells,
      ...(profile.nick === undefined ? {} : { nick: profile.nick }),
      ...(profile.spectator ? { spectator: true } : {}),
    };
  };

  const sendTo = (hub: Hub, msg: ClientMsg): void => {
    if (hub.ws?.readyState !== WebSocket.OPEN) return;
    try {
      hub.ws.send(JSON.stringify(msg));
    } catch {
      // The socket is on its way out; the close handler will reconnect.
    }
  };

  const sendPos = (
    fuzzed: { lat: number; lng: number; heading: number; speed: number },
    now: number,
  ): void => {
    lastSent = { heading: fuzzed.heading, speed: fuzzed.speed, sentAt: now };
    lastSentAt = now;
    const msg: ClientMsg = {
      t: 'pos',
      lat: fuzzed.lat,
      lng: fuzzed.lng,
      heading: fuzzed.heading,
      speed: fuzzed.speed,
      ts: now,
    };
    for (const hub of hubs.values()) sendTo(hub, msg);
  };

  /**
   * Keep the hub fed when fixes stop arriving. `update` only runs when the device delivers a
   * new fix, and a parked car's `watchPosition`, or a phone whose screen went dark, can go
   * quiet for minutes. The socket stays open, pings keep being answered, the HUD says live,
   * and the hub evicts us 60 s after the last position anyway: everyone else watches the car
   * disappear for no reason. So the last fuzzed position is repeated at the stationary
   * cadence, and only when nothing else was sent in that time, so a device that is getting
   * fixes sends nothing extra (ADR-0009, which rejected send-on-change for exactly this).
   */
  const feedIfQuiet = (): void => {
    if (!running || !profile || hidden || profile.spectator || !lastFuzzed) return;
    if (![...hubs.values()].some((h) => h.ws?.readyState === WebSocket.OPEN)) return;
    const now = Date.now();
    if (now - lastSentAt < POS_INTERVAL_STATIONARY_MS) return;
    sendPos(lastFuzzed, now);
  };

  const teardown = (hub: Hub): void => {
    if (hub.keepalive !== null) clearInterval(hub.keepalive);
    if (hub.retry !== null) clearTimeout(hub.retry);
    hub.keepalive = null;
    hub.retry = null;
    const ws = hub.ws;
    hub.ws = null;
    hub.helloSent = false;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    }
  };

  const scheduleReconnect = (hub: Hub): void => {
    if (!running || hub.retry !== null) return;
    const base = BACKOFF_MS[Math.min(hub.attempts, BACKOFF_MS.length - 1)] ?? 30_000;
    // Jitter, so a whole motorway of cars does not reconnect in lockstep.
    const delay = base * (0.7 + Math.random() * 0.6);
    hub.attempts += 1;
    // After a couple of failures, ask why: a socket that will not open because the day's
    // free budget is gone deserves an honest message rather than a silent retry loop.
    if (hub.attempts === PROBE_AFTER_ATTEMPTS) void probe();
    hub.retry = window.setTimeout(() => {
      hub.retry = null;
      open(hub);
    }, delay);
    refreshStatus();
  };

  const probe = async (): Promise<void> => {
    const reason = await probeAvailability();
    if (!running) return;
    if (reason) setStatus(reason);
    else if (status === 'budget' || status === 'paused') {
      // It is back: let refreshStatus take over again.
      status = 'reconnecting';
      refreshStatus();
    }
  };

  function open(hub: Hub): void {
    if (!running || hub.ws) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(hub.hub));
    } catch {
      scheduleReconnect(hub);
      return;
    }
    hub.ws = ws;
    hub.lastInbound = Date.now();

    ws.onopen = () => {
      hub.attempts = 0;
      if (status === 'budget' || status === 'paused') status = 'reconnecting';
      const hello = helloFor(hub);
      if (hello) {
        sendTo(hub, hello);
        hub.helloSent = true;
      }
      // Say where we are straight away rather than waiting for the send policy. A stopped car
      // only reports every 30 s, so after a dropped socket it would sit invisible to everyone
      // else for half a minute — and the hub evicts at 60 s, so a second blip erases it.
      if (lastFuzzed && !hidden && profile && !profile.spectator) {
        const now = Date.now();
        sendTo(hub, { t: 'pos', ...lastFuzzed, ts: now });
        lastSent = { heading: lastFuzzed.heading, speed: lastFuzzed.speed, sentAt: now };
        lastSentAt = now;
      }
      hub.keepalive = window.setInterval(() => {
        // Answered by the runtime without waking the durable object: free keepalive.
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        if (Date.now() - hub.lastInbound > STALE_MS) {
          teardown(hub);
          scheduleReconnect(hub);
        }
      }, KEEPALIVE_MS);
      refreshStatus();
    };

    ws.onmessage = (event) => {
      hub.lastInbound = Date.now();
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      const msg = parseServerMsg(event.data);
      if (msg) handlers.onMessage(msg);
    };

    ws.onerror = () => {
      // onclose always follows; nothing to do here beyond letting it happen.
    };

    ws.onclose = () => {
      teardown(hub);
      if (!running) return;
      scheduleReconnect(hub);
    };
  }

  const ensureHubs = (cells: string[]): void => {
    const grouped = groupByHub(cells);
    // Never hold more sockets than the protocol allows, even at a three-way corner.
    const wanted = [...grouped.entries()].slice(0, MAX_SOCKETS_PER_CLIENT);
    const wantedIds = new Set(wanted.map(([hub]) => hub));

    for (const [id, hub] of hubs)
      if (!wantedIds.has(id)) {
        teardown(hub);
        hubs.delete(id);
        handlers.onCellsDropped(hub.cells);
      }

    for (const [id, hubCells] of wanted) {
      const existing = hubs.get(id);
      if (!existing) {
        const hub: Hub = {
          hub: id,
          cells: hubCells,
          ws: null,
          attempts: 0,
          retry: null,
          keepalive: null,
          lastInbound: Date.now(),
          helloSent: false,
        };
        hubs.set(id, hub);
        open(hub);
        continue;
      }
      const changed =
        existing.cells.length !== hubCells.length ||
        existing.cells.some((cell, i) => cell !== hubCells[i]);
      if (changed) {
        const dropped = existing.cells.filter((c) => !hubCells.includes(c));
        existing.cells = hubCells;
        if (existing.helloSent) sendTo(existing, { t: 'sub', cells: hubCells });
        else sendTo(existing, helloFor(existing) ?? { t: 'sub', cells: hubCells });
        if (dropped.length > 0) handlers.onCellsDropped(dropped);
      }
    }

    // The cells we actually hold a socket for — not `cells`, which can name a hub we dropped
    // at MAX_SOCKETS_PER_CLIENT. Counts are summed over this set, so it has to be the truth.
    const held = [...hubs.values()].flatMap((h) => h.cells).sort();
    if (held.length !== subscribed.length || held.some((cell, i) => cell !== subscribed[i])) {
      subscribed = held;
      handlers.onCells(held);
    }
    refreshStatus();
  };

  /**
   * Bring every socket back now, without waiting out a backoff.
   *
   * A tab that was hidden, or a car that drove through a tunnel, comes back with sockets the
   * browser froze: `onclose` may never have fired, so the connection looks open and is dead.
   * Anything that has not heard from the hub recently is torn down and reopened immediately,
   * and the next fix is sent even if the send policy would have skipped it — otherwise the
   * hub evicts us at 60 s and everyone else watches a ghost.
   */
  const wake = (): void => {
    if (!running) return;
    const now = Date.now();
    for (const hub of hubs.values()) {
      const fresh = hub.ws?.readyState === WebSocket.OPEN && now - hub.lastInbound < STALE_MS;
      if (fresh) continue;
      teardown(hub);
      hub.attempts = 0;
      open(hub);
    }
    lastSent = null;
    refreshStatus();
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') wake();
  };

  return {
    start(next) {
      profile = next;
      running = true;
      lastSent = null;
      lastFuzzed = null;
      subscribed = [];
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('online', wake);
      window.addEventListener('pageshow', wake);
      if (feed !== null) clearInterval(feed);
      feed = window.setInterval(feedIfQuiet, FEED_CHECK_MS);
      setStatus('connecting');
    },

    stop() {
      running = false;
      if (feed !== null) clearInterval(feed);
      feed = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
      for (const hub of hubs.values()) teardown(hub);
      hubs.clear();
      subscribed = [];
      handlers.onCells([]);
      setStatus('idle');
    },

    setProfile(next) {
      profile = next;
      for (const hub of hubs.values()) {
        const hello = helloFor(hub);
        if (hello) sendTo(hub, hello);
      }
    },

    setHidden(next) {
      hidden = next;
      for (const hub of hubs.values()) sendTo(hub, { t: hidden ? 'hide' : 'show' });
    },

    update(fuzzed) {
      if (!running || !profile) return false;
      lastFuzzed = fuzzed;
      const cells = cellsWithin(fuzzed.lat, fuzzed.lng, NEIGHBOUR_RADIUS_M, CELL_PRECISION);
      ensureHubs(cells);
      if (hidden || profile.spectator) return false;

      const now = Date.now();
      if (!shouldSendPos(lastSent, fuzzed, now)) return false;
      sendPos(fuzzed, now);
      return true;
    },

    send(msg) {
      for (const hub of hubs.values()) sendTo(hub, msg);
    },

    status: () => status,
  };
}


