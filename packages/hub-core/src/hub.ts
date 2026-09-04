import {
  CELL_PRECISION,
  CLOSE_BAD_HELLO,
  CLOSE_CAPACITY,
  CLOSE_PROTOCOL,
  CLOSE_WRONG_HUB,
  MAX_SOCKETS_PER_CELL,
  MAX_SOCKETS_PER_HUB,
  MAX_SPEED_KMH,
  PRESENCE_EXPIRY_MS,
  RATE_POS_MS,
  RATE_VIOLATIONS_TO_CLOSE,
  RATE_WAVE_MS,
  SERVER_TICK_MS,
  WAVE_VALIDATE_RANGE_M,
  encode,
  haversineM,
  hubOf,
  type CarPublic,
  type CarState,
  type ClientMsg,
} from '@teslawave/protocol';
import type { Counters, Effect, HubState, Socket, SocketKey, SocketProfile } from './types.js';

/** Counters are flushed to storage at most this often, to stay far under 100k row writes/day. */
export const COUNTER_WRITE_MS = 30_000;
/** At most this many counter keys per storage write, so one flush is never a big batch. */
export const MAX_PERSIST_KEYS = 128;
/** A message arriving faster than this is not jitter, it is a client that must be closed. */
const ABUSE_POS_MS = RATE_POS_MS / 2;
/** Slack over MAX_SPEED_KMH for GPS noise and the fuzz random walk. */
const IMPLIED_SPEED_GRACE_KMH = 30;

export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
export const userWavesKey = (id: string): string => `w:${id}`;
export const cellDayKey = (cell: string, now: number): string => `c:${cell}:${dayKey(now)}`;

export function createHub(hub: string, now: number, counters?: Partial<Counters>): HubState {
  return {
    hub,
    presence: new Map(),
    sockets: new Map(),
    socketsByCell: new Map(),
    socketsById: new Map(),
    dirty: new Map(),
    gone: new Map(),
    lastFlushAt: now,
    counters: {
      wavesByUser: counters?.wavesByUser ?? new Map(),
      wavesByCellDay: counters?.wavesByCellDay ?? new Map(),
      lastWaveTsByCell: counters?.lastWaveTsByCell ?? new Map(),
      dirtyKeys: new Set(),
      lastWriteAt: counters?.lastWriteAt ?? now,
    },
  };
}

const addTo = <K, V>(map: Map<K, Set<V>>, key: K, value: V): void => {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
};

const removeFrom = <K, V>(map: Map<K, Set<V>>, key: K, value: V): void => {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
};

const publicOf = (car: CarState): CarPublic => ({
  id: car.id,
  model: car.model,
  colour: car.colour,
  waves: car.waves,
  since: car.since,
  ...(car.nick === undefined ? {} : { nick: car.nick }),
});

const profileOf = (s: Socket): SocketProfile => ({
  key: s.key,
  id: s.id,
  model: s.model,
  colour: s.colour,
  cells: s.cells,
  spectator: s.spectator,
  hidden: s.hidden,
  since: s.since,
  ...(s.nick === undefined ? {} : { nick: s.nick }),
});

const markDirty = (state: HubState, cell: string, id: string): void => addTo(state.dirty, cell, id);

const markGone = (state: HubState, cell: string, id: string): void => {
  removeFrom(state.dirty, cell, id);
  addTo(state.gone, cell, id);
};

const indexSocket = (state: HubState, s: Socket): void => {
  state.sockets.set(s.key, s);
  addTo(state.socketsById, s.id, s.key);
  for (const cell of s.cells) addTo(state.socketsByCell, cell, s.key);
};

const unindexCells = (state: HubState, s: Socket): void => {
  for (const cell of s.cells) removeFrom(state.socketsByCell, cell, s.key);
};

/** Rebuild one connection after a hibernation wake, from its stored attachment. */
export function restoreSocket(state: HubState, profile: SocketProfile): void {
  if (state.sockets.has(profile.key)) return;
  indexSocket(state, {
    ...profile,
    lastPosAt: 0,
    lastWaveAt: 0,
    violations: 0,
    lastSeen: null,
  });
}

/** A connection that has opened but not said hello yet. */
export function openSocket(state: HubState, key: SocketKey): void {
  state.sockets.set(key, {
    key,
    id: '',
    model: '3',
    colour: 'black',
    cells: [],
    spectator: false,
    hidden: false,
    since: 0,
    lastPosAt: 0,
    lastWaveAt: 0,
    violations: 0,
    lastSeen: null,
  });
}

const dropPresence = (state: HubState, id: string): void => {
  const car = state.presence.get(id);
  if (!car) return;
  state.presence.delete(id);
  markGone(state, car.cell, id);
};

export function onClose(state: HubState, key: SocketKey): Effect[] {
  const s = state.sockets.get(key);
  if (!s) return [];
  unindexCells(state, s);
  removeFrom(state.socketsById, s.id, key);
  state.sockets.delete(key);
  // A driver keeps both phone and car connected; only drop presence when the last one goes.
  if (s.id && !state.socketsById.has(s.id)) dropPresence(state, s.id);
  return [];
}

const violation = (s: Socket): Effect[] => {
  s.violations += 1;
  if (s.violations >= RATE_VIOLATIONS_TO_CLOSE)
    return [{ k: 'close', to: s.key, code: CLOSE_PROTOCOL, reason: 'protocol' }];
  return [];
};

const snapshotFor = (state: HubState, cells: readonly string[], selfId: string): CarState[] => {
  const out: CarState[] = [];
  for (const car of state.presence.values())
    if (car.id !== selfId && cells.includes(car.cell)) out.push(car);
  return out;
};

const cellStats = (
  state: HubState,
  cell: string,
  now: number,
): { online: number; wavesToday: number; lastWaveTs: number | null } => {
  let online = 0;
  for (const car of state.presence.values()) if (car.cell === cell) online++;
  return {
    online,
    wavesToday: state.counters.wavesByCellDay.get(cellDayKey(cell, now)) ?? 0,
    lastWaveTs: state.counters.lastWaveTsByCell.get(cell) ?? null,
  };
};

function onHello(state: HubState, s: Socket, msg: Extract<ClientMsg, { t: 'hello' }>, now: number): Effect[] {
  for (const cell of msg.cells)
    if (hubOf(cell) !== state.hub)
      return [{ k: 'close', to: s.key, code: CLOSE_WRONG_HUB, reason: 'wrong hub' }];

  const first = s.id === '';
  if (first) {
    if (state.sockets.size > MAX_SOCKETS_PER_HUB)
      return [{ k: 'close', to: s.key, code: CLOSE_CAPACITY, reason: 'hub full' }];
    const home = msg.cells[0];
    if (!home) return [{ k: 'close', to: s.key, code: CLOSE_BAD_HELLO, reason: 'no cells' }];
    if ((state.socketsByCell.get(home)?.size ?? 0) >= MAX_SOCKETS_PER_CELL)
      return [{ k: 'close', to: s.key, code: CLOSE_CAPACITY, reason: 'cell full' }];
  }

  unindexCells(state, s);
  if (s.id) removeFrom(state.socketsById, s.id, s.key);

  s.id = msg.id;
  s.model = msg.model;
  s.colour = msg.colour;
  if (msg.nick === undefined) delete s.nick;
  else s.nick = msg.nick;
  s.cells = [...msg.cells];
  s.spectator = msg.spectator === true;
  s.since = state.presence.get(msg.id)?.since ?? (s.since || now);
  indexSocket(state, s);

  const self = state.presence.get(s.id);
  const effects: Effect[] = [
    { k: 'attach', to: s.key, profile: profileOf(s) },
    {
      k: 'send',
      to: s.key,
      msg: {
        t: 'welcome',
        now,
        you: self ? publicOf(self) : null,
        cells: s.cells,
        snapshot: snapshotFor(state, s.cells, s.id),
      },
    },
  ];
  // Counters immediately, so the HUD is never empty while waiting for the first tick.
  for (const cell of s.cells)
    effects.push({
      k: 'send',
      to: s.key,
      msg: { t: 'diff', cell, upd: [], gone: [], ...cellStats(state, cell, now) },
    });
  return effects;
}

function onPos(state: HubState, s: Socket, msg: Extract<ClientMsg, { t: 'pos' }>, now: number): Effect[] {
  if (!s.id) return violation(s);
  if (s.spectator || s.hidden) return [];

  const since = now - s.lastPosAt;
  if (s.lastPosAt !== 0 && since < RATE_POS_MS)
    return since < ABUSE_POS_MS ? violation(s) : [];

  if (msg.speed > MAX_SPEED_KMH) return violation(s);
  if (s.lastSeen) {
    const dt = Math.max(now - s.lastSeen.ts, 1) / 1000;
    const implied = (haversineM(s.lastSeen.lat, s.lastSeen.lng, msg.lat, msg.lng) / dt) * 3.6;
    if (implied > MAX_SPEED_KMH + IMPLIED_SPEED_GRACE_KMH) return violation(s);
  }

  s.lastPosAt = now;
  s.lastSeen = { lat: msg.lat, lng: msg.lng, ts: now };

  const cell = encode(msg.lat, msg.lng, CELL_PRECISION);
  const previous = state.presence.get(s.id);
  if (previous && previous.cell !== cell) markGone(state, previous.cell, s.id);

  state.presence.set(s.id, {
    id: s.id,
    model: s.model,
    colour: s.colour,
    waves: state.counters.wavesByUser.get(userWavesKey(s.id)) ?? 0,
    since: s.since,
    lat: msg.lat,
    lng: msg.lng,
    heading: msg.heading,
    speed: msg.speed,
    ts: now,
    cell,
    ...(s.nick === undefined ? {} : { nick: s.nick }),
  });
  markDirty(state, cell, s.id);
  return [];
}

function onSub(state: HubState, s: Socket, msg: Extract<ClientMsg, { t: 'sub' }>, now: number): Effect[] {
  if (!s.id) return violation(s);
  for (const cell of msg.cells)
    if (hubOf(cell) !== state.hub)
      return [{ k: 'close', to: s.key, code: CLOSE_WRONG_HUB, reason: 'wrong hub' }];

  const added = msg.cells.filter((c) => !s.cells.includes(c));
  unindexCells(state, s);
  s.cells = [...msg.cells];
  for (const cell of s.cells) addTo(state.socketsByCell, cell, s.key);

  const effects: Effect[] = [{ k: 'attach', to: s.key, profile: profileOf(s) }];
  for (const cell of added)
    effects.push({
      k: 'send',
      to: s.key,
      msg: {
        t: 'diff',
        cell,
        upd: snapshotFor(state, [cell], s.id),
        gone: [],
        ...cellStats(state, cell, now),
      },
    });
  return effects;
}

function onWave(state: HubState, s: Socket, to: string, now: number): Effect[] {
  if (!s.id) return violation(s);

  const fail = (reason: 'range' | 'offline' | 'rate' | 'hidden'): Effect[] => [
    { k: 'send', to: s.key, msg: { t: 'waved', to, ok: false, reason } },
  ];

  if (now - s.lastWaveAt < RATE_WAVE_MS) return fail('rate');
  const from = state.presence.get(s.id);
  if (!from || s.hidden || s.spectator) return fail('hidden');
  const target = state.presence.get(to);
  if (!target || to === s.id) return fail('offline');
  if (haversineM(from.lat, from.lng, target.lat, target.lng) > WAVE_VALIDATE_RANGE_M)
    return fail('range');

  s.lastWaveAt = now;

  // A wave counts for both parties. No leaderboard, no ranking (brief 4.3).
  const c = state.counters;
  for (const id of [s.id, to]) {
    const key = userWavesKey(id);
    const next = (c.wavesByUser.get(key) ?? 0) + 1;
    c.wavesByUser.set(key, next);
    c.dirtyKeys.add(key);
    const car = state.presence.get(id);
    if (car) {
      car.waves = next;
      markDirty(state, car.cell, id);
    }
  }
  for (const cell of new Set([from.cell, target.cell])) {
    const key = cellDayKey(cell, now);
    c.wavesByCellDay.set(key, (c.wavesByCellDay.get(key) ?? 0) + 1);
    c.lastWaveTsByCell.set(cell, now);
    c.dirtyKeys.add(key);
  }

  const effects: Effect[] = [{ k: 'send', to: s.key, msg: { t: 'waved', to, ok: true } }];
  // Every device of the target (phone and car) hears about it.
  for (const key of state.socketsById.get(to) ?? [])
    effects.push({ k: 'send', to: key, msg: { t: 'wave', from: publicOf(from), ts: now } });
  return effects;
}

export function onMessage(
  state: HubState,
  key: SocketKey,
  msg: ClientMsg,
  now: number,
): Effect[] {
  const s = state.sockets.get(key);
  if (!s) return [];
  switch (msg.t) {
    case 'hello':
      return onHello(state, s, msg, now);
    case 'pos':
      return onPos(state, s, msg, now);
    case 'sub':
      return onSub(state, s, msg, now);
    case 'wave':
      return onWave(state, s, msg.to, now);
    case 'hide': {
      s.hidden = true;
      dropPresence(state, s.id);
      return [{ k: 'attach', to: s.key, profile: profileOf(s) }];
    }
    case 'show': {
      s.hidden = false;
      return [{ k: 'attach', to: s.key, profile: profileOf(s) }];
    }
  }
}

/** A message that failed the guard, or arrived too large. */
export function onBadMessage(state: HubState, key: SocketKey): Effect[] {
  const s = state.sockets.get(key);
  if (!s) return [];
  const effects = violation(s);
  return effects.length > 0
    ? effects
    : [{ k: 'send', to: key, msg: { t: 'error', code: 'bad' } }];
}

/**
 * Build and send the per-cell diffs, at most one per cell per SERVER_TICK_MS.
 * Called after every event: there is no timer anywhere in the hub, because a timer
 * makes the Durable Object ineligible for hibernation and bills it 24/7 (ADR-0002).
 */
export function flushIfDue(state: HubState, now: number, force = false): Effect[] {
  if (!force && now - state.lastFlushAt < SERVER_TICK_MS) return [];
  state.lastFlushAt = now;

  for (const [id, car] of state.presence)
    if (now - car.ts > PRESENCE_EXPIRY_MS) {
      state.presence.delete(id);
      markGone(state, car.cell, id);
    }

  const cells = new Set([...state.dirty.keys(), ...state.gone.keys()]);
  const effects: Effect[] = [];

  for (const cell of cells) {
    const subscribers = state.socketsByCell.get(cell);
    const gone = [...(state.gone.get(cell) ?? [])];
    const upd: CarState[] = [];
    for (const id of state.dirty.get(cell) ?? []) {
      const car = state.presence.get(id);
      if (car && car.cell === cell) upd.push(car);
    }
    if (subscribers && (upd.length > 0 || gone.length > 0)) {
      const msg = { t: 'diff' as const, cell, upd, gone, ...cellStats(state, cell, now) };
      for (const key of subscribers) effects.push({ k: 'send', to: key, msg });
    }
  }
  state.dirty.clear();
  state.gone.clear();

  const c = state.counters;
  if (c.dirtyKeys.size > 0 && now - c.lastWriteAt >= COUNTER_WRITE_MS) {
    c.lastWriteAt = now;
    const keys = [...c.dirtyKeys].slice(0, MAX_PERSIST_KEYS);
    const entries: [string, number][] = [];
    for (const key of keys) {
      c.dirtyKeys.delete(key);
      const value = key.startsWith('w:') ? c.wavesByUser.get(key) : c.wavesByCellDay.get(key);
      if (value !== undefined) entries.push([key, value]);
    }
    if (entries.length > 0) effects.push({ k: 'persist', entries });
  }
  return effects;
}

/** Test and observability helper. Never returns positions. */
export const hubStats = (state: HubState): {
  hub: string;
  sockets: number;
  presence: number;
  cells: number;
} => ({
  hub: state.hub,
  sockets: state.sockets.size,
  presence: state.presence.size,
  cells: state.socketsByCell.size,
});
