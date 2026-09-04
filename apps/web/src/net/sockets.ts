import {
  CELL_PRECISION,
  MAX_SOCKETS_PER_CLIENT,
  NEIGHBOUR_RADIUS_M,
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
const KEEPALIVE_MS = 25_000;
const STALE_MS = 60_000;

export function createNet(handlers: {
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: NetStatus) => void;
  onCellsDropped: (cells: string[]) => void;
}): Net {
  const hubs = new Map<string, Hub>();
  let profile: NetProfile | null = null;
  let hidden = false;
  let lastSent: SentPos | null = null;
  let status: NetStatus = 'idle';
  let running = false;

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
    hub.retry = window.setTimeout(() => {
      hub.retry = null;
      open(hub);
    }, delay);
    refreshStatus();
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
      const hello = helloFor(hub);
      if (hello) {
        sendTo(hub, hello);
        hub.helloSent = true;
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
    refreshStatus();
  };

  return {
    start(next) {
      profile = next;
      running = true;
      lastSent = null;
      setStatus('connecting');
    },

    stop() {
      running = false;
      for (const hub of hubs.values()) teardown(hub);
      hubs.clear();
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
      const cells = cellsWithin(fuzzed.lat, fuzzed.lng, NEIGHBOUR_RADIUS_M, CELL_PRECISION);
      ensureHubs(cells);
      if (hidden || profile.spectator) return false;

      const now = Date.now();
      if (!shouldSendPos(lastSent, fuzzed, now)) return false;
      lastSent = { heading: fuzzed.heading, speed: fuzzed.speed, sentAt: now };
      const msg: ClientMsg = {
        t: 'pos',
        lat: fuzzed.lat,
        lng: fuzzed.lng,
        heading: fuzzed.heading,
        speed: fuzzed.speed,
        ts: now,
      };
      for (const hub of hubs.values()) sendTo(hub, msg);
      return true;
    },

    send(msg) {
      for (const hub of hubs.values()) sendTo(hub, msg);
    },

    status: () => status,
  };
}

/** The Worker answers 429 when the day's free budget is gone, and 503 when paused. */
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
