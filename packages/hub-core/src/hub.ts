import {
  CELL_PRECISION,
  CLOSE_BAD_HELLO,
  CLOSE_CAPACITY,
  CLOSE_PROTOCOL,
  CLOSE_WRONG_HUB,
  COMPACT_WIRE_VERSION,
  INTEREST_DROP_RADIUS_M,
  INTEREST_RADIUS_M,
  MAX_SOCKETS_PER_CELL,
  MAX_SOCKETS_PER_HUB,
  MAX_SPEED_KMH,
  PRESENCE_EXPIRY_MS,
  PROTOCOL_VERSION,
  RATE_POS_MS,
  RATE_VIOLATIONS_TO_CLOSE,
  RATE_WAVE_MS,
  SERVER_TICK_MS,
  WAVE_VALIDATE_RANGE_M,
  WIRE_COORD_SCALE,
  encode,
  haversineM,
  hubOf,
  idFromSecret,
  type CarMeta,
  type CarPublic,
  type CarState,
  type CarWire,
  type ClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';
import type { Counters, Effect, HubState, Socket, SocketKey, SocketProfile } from './types.js';

/** Counters are flushed to storage at most this often, to stay far under 100k row writes/day. */
export const COUNTER_WRITE_MS = 30_000;
/** At most this many counter keys per storage write, so one flush is never a big batch. */
export const MAX_PERSIST_KEYS = 128;
/** A message arriving faster than this is not jitter, it is a client that must be closed. */
const ABUSE_POS_MS = RATE_POS_MS / 2;
/** Slack over MAX_SPEED_KMH for GPS noise. */
const IMPLIED_SPEED_GRACE_KMH = 30;

/** A driver who has not waved in this long is forgotten by the daily harvest. */
export const USER_WAVES_TTL_MS = 180 * 86_400_000;

export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
export const userWavesKey = (id: string): string => `w:${id}`;
export const userWaveTsKey = (id: string): string => `wt:${id}`;
export const cellDayKey = (cell: string, now: number): string => `c:${cell}:${dayKey(now)}`;

export function createHub(hub: string, now: number, counters?: Partial<Counters>): HubState {
  return {
    hub,
    presence: new Map(),
    presenceByCell: new Map(),
    handles: new Map(),
    nextHandle: 1,
    sockets: new Map(),
    socketsByCell: new Map(),
    socketsById: new Map(),
    dirty: new Map(),
    gone: new Map(),
    lastFlushAt: now,
    counters: {
      wavesByUser: counters?.wavesByUser ?? new Map(),
      lastWaveByUser: counters?.lastWaveByUser ?? new Map(),
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
  v: s.v,
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
    holding: new Map(),
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
    v: 0,
    lastPosAt: 0,
    lastWaveAt: 0,
    violations: 0,
    lastSeen: null,
    holding: new Map(),
  });
}

/**
 * The only two places `presence` is written, so its per-cell index cannot drift from it. A
 * desync there would be invisible until a driver was missing from someone's map for no
 * reason, which is the hardest kind of bug this codebase has had.
 */
const setPresence = (state: HubState, car: CarState): void => {
  const previous = state.presence.get(car.id);
  if (previous && previous.cell !== car.cell) removeFrom(state.presenceByCell, previous.cell, car.id);
  state.presence.set(car.id, car);
  addTo(state.presenceByCell, car.cell, car.id);
};

const removePresence = (state: HubState, id: string): CarState | undefined => {
  const car = state.presence.get(id);
  if (!car) return undefined;
  state.presence.delete(id);
  removeFrom(state.presenceByCell, car.cell, id);
  return car;
};

const dropPresence = (state: HubState, id: string): void => {
  const car = removePresence(state, id);
  if (car) markGone(state, car.cell, id);
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

const carsIn = (state: HubState, cell: string): CarState[] => {
  const out: CarState[] = [];
  for (const id of state.presenceByCell.get(cell) ?? []) {
    const car = state.presence.get(id);
    if (car) out.push(car);
  }
  return out;
};

const snapshotFor = (state: HubState, cells: readonly string[], selfId: string): CarState[] => {
  const out: CarState[] = [];
  for (const cell of cells) for (const car of carsIn(state, cell)) if (car.id !== selfId) out.push(car);
  return out;
};

/**
 * The point a connection's interest is measured from, or null for "the whole cell".
 *
 * A visible driver who is reporting has a position, and it is the one the hub already keeps
 * for the implied-speed check — nothing new is stored to do this. A spectator or an invisible
 * driver sends no positions at all (that is what invisible means), so there is nothing to
 * measure from and they are served their subscribed cells entire, exactly as everyone was
 * before ADR-0033. They are a small minority and they are not the ones creating the fan-out.
 *
 * A stale fix is no better than none: a driver who went invisible half an hour ago has
 * carried on driving, and their last known position would show them the wrong piece of road.
 */
const interestFrom = (s: Socket, now: number): { lat: number; lng: number } | null => {
  if (s.hidden || s.spectator || !s.lastSeen) return null;
  if (now - s.lastSeen.ts > PRESENCE_EXPIRY_MS) return null;
  return { lat: s.lastSeen.lat, lng: s.lastSeen.lng };
};

const M_PER_DEG_LAT = 111_320;

/**
 * A driver's interest, with everything that does not change per car worked out once.
 *
 * This matters more than it looks. The interest test runs once per subscriber per car in the
 * cell, so in a city where a thousand drivers are all within range of each other it runs a
 * million times a tick. Anything left inside it — a cosine, a square root, a map lookup — is
 * paid a million times, in one thread, on the object every one of those drivers is connected
 * to.
 *
 * Distance is measured on the flat, not on the sphere: metres east and metres north of the
 * driver, compared as squares so there is no square root either. Over twelve kilometres the
 * error against haversine is centimetres, and this is a soft threshold with a hysteresis band
 * around it — a car is not "nearly on your map". Where exactness is the point, a wave being
 * accepted or refused, haversine is still what decides it.
 */
type Interest = {
  lat: number;
  lng: number;
  mPerDegLng: number;
  /** Squared metres, so the comparison needs no root: entering, and the wider one for leaving. */
  enter2: number;
  drop2: number;
};

const interestOf = (from: { lat: number; lng: number }): Interest => ({
  lat: from.lat,
  lng: from.lng,
  // Longitude degrees shrink towards the poles. Clamped so a driver near one cannot divide
  // the world by nothing.
  mPerDegLng: M_PER_DEG_LAT * Math.max(0.02, Math.cos((from.lat * Math.PI) / 180)),
  enter2: INTEREST_RADIUS_M * INTEREST_RADIUS_M,
  drop2: INTEREST_DROP_RADIUS_M * INTEREST_DROP_RADIUS_M,
});

/**
 * Is this car close enough to be on that driver's map?
 *
 * Two radii, not one. A car hovering either side of a single threshold would be announced and
 * withdrawn every couple of seconds, which on the map is a car blinking in and out — the
 * exact fault ADR-0031 was about, arrived at from a different direction. Something already
 * held is kept until it is meaningfully further out.
 */
function inInterest(from: Interest, lat: number, lng: number, held: boolean): boolean {
  const dy = (lat - from.lat) * M_PER_DEG_LAT;
  const dx = (lng - from.lng) * from.mPerDegLng;
  return dx * dx + dy * dy <= (held ? from.drop2 : from.enter2);
}

const metaOf = (car: CarState, h: number): CarMeta => ({
  h,
  id: car.id,
  model: car.model,
  colour: car.colour,
  since: car.since,
  cell: car.cell,
  ...(car.nick === undefined ? {} : { nick: car.nick }),
});

const wireOf = (car: CarState, h: number, now: number): CarWire => [
  h,
  Math.round(car.lat * WIRE_COORD_SCALE),
  Math.round(car.lng * WIRE_COORD_SCALE),
  Math.round(car.heading),
  Math.round(car.speed),
  car.waves,
  Math.max(0, now - car.ts),
];

/**
 * The handle standing in for this driver on the compact wire, and the revision of what we
 * last said about them. Assigned on demand and never persisted: after a hibernation wake the
 * table is empty, every car is new to every connection again, and the descriptions are re-sent
 * — which is right, because presence is empty then too.
 */
function handleFor(state: HubState, id: string): { h: number; rev: number } {
  const existing = state.handles.get(id);
  if (existing) return existing;
  const fresh = { h: state.nextHandle++, rev: 1 };
  state.handles.set(id, fresh);
  return fresh;
}

/** The driver edited their car, so everyone holding it needs telling once more. */
const bumpHandleRev = (state: HubState, id: string): void => {
  const entry = state.handles.get(id);
  if (entry) entry.rev += 1;
};

const cellStats = (
  state: HubState,
  cell: string,
  now: number,
): { online: number; wavesToday: number; lastWaveTs: number | null } => {
  return {
    online: state.presenceByCell.get(cell)?.size ?? 0,
    wavesToday: state.counters.wavesByCellDay.get(cellDayKey(cell, now)) ?? 0,
    lastWaveTs: state.counters.lastWaveTsByCell.get(cell) ?? null,
  };
};

/**
 * Every car in one cell that belongs on this connection's map right now, described in full
 * because the connection is holding none of them yet. Used for a hello and for a newly
 * subscribed cell — the two moments where there is no previous state to diff against.
 */
function enterCell(
  state: HubState,
  s: Socket,
  cell: string,
  now: number,
): { meta: CarMeta[]; upd: CarWire[]; gone: number[] } {
  const origin = interestFrom(s, now);
  const from = origin === null ? null : interestOf(origin);
  const meta: CarMeta[] = [];
  const upd: CarWire[] = [];
  for (const car of carsIn(state, cell)) {
    if (car.id === s.id) continue;
    if (from !== null && !inInterest(from, car.lat, car.lng, false)) continue;
    const handle = handleFor(state, car.id);
    s.holding.set(handle.h, handle.rev);
    meta.push(metaOf(car, handle.h));
    upd.push(wireOf(car, handle.h, now));
  }
  return { meta, upd, gone: [] };
}

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

  // The public id is ours to derive, never the client's to choose (ADR-0025).
  s.id = idFromSecret(msg.secret);
  s.model = msg.model;
  s.colour = msg.colour;
  if (msg.nick === undefined) delete s.nick;
  else s.nick = msg.nick;
  s.cells = [...msg.cells];
  s.spectator = msg.spectator === true;
  s.since = state.presence.get(s.id)?.since ?? (s.since || now);
  s.v = msg.v;
  /*
   * A fresh hello is a fresh description of everything: the connection may be a reconnect
   * whose handles are from a hub that has since restarted, and the profile in this hello may
   * be a car the driver has just edited. Cheaper to say it all again than to reason about
   * which half is stale.
   */
  s.holding = new Map();
  bumpHandleRev(state, s.id);
  /*
   * The position in the hello, if there is one, is only ever an interest origin: it decides
   * which cars this connection is shown and nothing else. It never enters presence, is never
   * broadcast, and is not what a wave is validated against — only `pos` does any of that.
   */
  if (msg.at && !s.spectator && !s.hidden)
    s.lastSeen = {
      lat: msg.at[0] / WIRE_COORD_SCALE,
      lng: msg.at[1] / WIRE_COORD_SCALE,
      ts: now,
    };
  indexSocket(state, s);

  const compact = s.v >= COMPACT_WIRE_VERSION;
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
        // A compact client is given the cars in the first diffs below, described once and
        // then referred to by handle. Sending them here as well would be saying it twice.
        snapshot: compact ? [] : snapshotFor(state, s.cells, s.id),
      },
    },
  ];
  // The cars, and the counters, immediately: the HUD is never empty while waiting for a tick,
  // and a driver who has just tapped Go sees the road they are on rather than an empty map.
  for (const cell of s.cells)
    effects.push({
      k: 'send',
      to: s.key,
      msg: compact
        ? { t: 'diff2', cell, now, ...enterCell(state, s, cell, now), ...cellStats(state, cell, now) }
        : { t: 'diff', cell, upd: [], gone: [], ...cellStats(state, cell, now) },
    });
  /*
   * An older client is told, not cut off. It keeps its map, its socket and its waves, and
   * reloads itself the next time the car is standing still (ADR-0029). Closing the socket
   * instead would take the map away from someone doing 120 km/h, and a client that cannot
   * be told anything is a client that can only be fixed by asking its owner to clear site
   * data on a car screen — which is exactly what ADR-0010 refused to risk.
   *
   * A client from the future is left alone: it is the hub that is behind, and a deploy fixes
   * that without anyone reloading anything.
   */
  if (msg.v < PROTOCOL_VERSION)
    effects.push({ k: 'send', to: s.key, msg: { t: 'upgrade', v: PROTOCOL_VERSION } });
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

  setPresence(state, {
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

  const compact = s.v >= COMPACT_WIRE_VERSION;
  const effects: Effect[] = [{ k: 'attach', to: s.key, profile: profileOf(s) }];
  for (const cell of added)
    effects.push({
      k: 'send',
      to: s.key,
      msg: compact
        ? { t: 'diff2', cell, now, ...enterCell(state, s, cell, now), ...cellStats(state, cell, now) }
        : {
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
  // A driver near a hub boundary reports to both hubs, so both hold both cars. The wave is
  // accepted by the hub that owns the target's cell and by no other: otherwise a client that
  // sent it everywhere would have it counted, chimed and carded twice.
  if (hubOf(target.cell) !== state.hub) return fail('offline');
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
    c.lastWaveByUser.set(userWaveTsKey(id), now);
    c.dirtyKeys.add(userWaveTsKey(id));
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

type CellStats = { online: number; wavesToday: number; lastWaveTs: number | null };

/**
 * The old shape: every car in the cell, in full, every tick.
 *
 * Kept for connections that have not reloaded into the compact wire yet. That is the whole
 * point of ADR-0029's promise — an old build keeps working — and this function is the price
 * of it. Delete it once the fleet has turned over; nothing else depends on it.
 */
function wholeDiff(
  state: HubState,
  s: Socket,
  cell: string,
  moved: CarState[],
  left: string[],
  stats: CellStats,
): ServerMsg | null {
  /*
   * A departure is per subscriber, not per cell: it means "gone from your map", not "gone
   * from this cell". A driver crossing a border is announced as gone from the old cell and
   * updated in the new one, in two separate frames — and to anyone who subscribes to both,
   * the departure is noise that arrives before or after the update depending on which cell
   * happened to be marked dirty first. Sending it to them at all is what made cars blink out
   * at every border (ADR-0031).
   */
  const gone = left.filter((id) => {
    const car = state.presence.get(id);
    return !car || !s.cells.includes(car.cell);
  });
  if (moved.length === 0 && gone.length === 0) return null;
  return { t: 'diff', cell, upd: moved, gone, ...stats };
}

/**
 * The compact shape: what changed on *this* driver's map, by handle (ADR-0033).
 *
 * Three kinds of news, and the connection's `holding` map is what tells them apart:
 *
 *   - a car that has come into range is described once and then referred to by handle;
 *   - a car already held that moved is six numbers and no keys;
 *   - a car that has left range, left the hub, or expired is a handle in `gone`.
 *
 * The last one is why interest has to be recomputed for cars that did *not* move: a driver
 * travelling away from a stationary car is what puts it out of range, and nothing in that
 * car's own state changes to say so. So the cell's whole population is considered, not only
 * the cars in this tick's dirty set — which is exactly the scan the box test in `inInterest`
 * exists to make cheap.
 */
/**
 * One cell's cars, worked out once for the whole flush rather than once per subscriber.
 *
 * The handle, and the six numbers that describe where a car is, are the same for everyone
 * who can see it. Building them inside the per-subscriber loop meant a thousand drivers in
 * one cell allocated a million tuples a tick to send a thousand distinct ones.
 */
type CellEntry = {
  car: CarState;
  h: number;
  rev: number;
  dirty: boolean;
  wire: CarWire;
};

function prepareCell(
  state: HubState,
  cell: string,
  moved: CarState[],
  now: number,
): CellEntry[] {
  const dirty = new Set(moved.map((car) => car.id));
  const out: CellEntry[] = [];
  for (const id of state.presenceByCell.get(cell) ?? []) {
    const car = state.presence.get(id);
    if (!car) continue;
    const handle = handleFor(state, id);
    out.push({
      car,
      h: handle.h,
      rev: handle.rev,
      dirty: dirty.has(id),
      wire: wireOf(car, handle.h, now),
    });
  }
  return out;
}

function compactDiff(
  s: Socket,
  cell: string,
  entries: CellEntry[],
  left: string[],
  stats: CellStats,
  now: number,
  state: HubState,
): ServerMsg | null {
  const origin = interestFrom(s, now);
  const from = origin === null ? null : interestOf(origin);
  const meta: CarMeta[] = [];
  const upd: CarWire[] = [];
  const gone: number[] = [];

  for (const entry of entries) {
    if (entry.car.id === s.id) continue;
    const heldRev = s.holding.get(entry.h);
    const held = heldRev !== undefined;
    if (from !== null && !inInterest(from, entry.car.lat, entry.car.lng, held)) {
      if (held) {
        s.holding.delete(entry.h);
        gone.push(entry.h);
      }
      continue;
    }
    if (!held || heldRev !== entry.rev) {
      // New to this connection, or the driver edited their car since we last described it.
      s.holding.set(entry.h, entry.rev);
      meta.push(metaOf(entry.car, entry.h));
      upd.push(entry.wire);
      continue;
    }
    if (entry.dirty) upd.push(entry.wire);
  }

  // Cars that left this cell entirely: expired, disconnected, or driven into another cell.
  // The same per-subscriber rule as above — one that moved to a cell this connection also
  // holds has not gone anywhere from its point of view.
  for (const id of left) {
    const car = state.presence.get(id);
    if (car && s.cells.includes(car.cell)) continue;
    const handle = state.handles.get(id);
    if (!handle || !s.holding.has(handle.h)) continue;
    s.holding.delete(handle.h);
    gone.push(handle.h);
  }

  /*
   * Sent even when there is no car news for this driver. The counters ride on this message,
   * and a driver alone in a cell — or one whose neighbours are all out of range — would
   * otherwise watch "N online" and "waves today" freeze at whatever they were when they
   * joined. An empty one of these is about ninety bytes; the fan-out this decision is about
   * was fifty megabytes a tick.
   */
  return { t: 'diff2', cell, now, meta, upd, gone, ...stats };
}

/**
 * Build and send the per-cell diffs, at most one per cell per SERVER_TICK_MS.
 * Called after every event: there is no timer anywhere in the hub, because a timer
 * makes the Durable Object ineligible for hibernation and bills it 24/7 (ADR-0002).
 */
export function flushIfDue(state: HubState, now: number, force = false): Effect[] {
  if (!force && now - state.lastFlushAt < SERVER_TICK_MS) return [];
  state.lastFlushAt = now;

  for (const [id, car] of [...state.presence])
    if (now - car.ts > PRESENCE_EXPIRY_MS) {
      removePresence(state, id);
      markGone(state, car.cell, id);
    }

  const cells = new Set([...state.dirty.keys(), ...state.gone.keys()]);
  const effects: Effect[] = [];

  for (const cell of cells) {
    const subscribers = state.socketsByCell.get(cell);
    if (!subscribers) continue;
    const left = [...(state.gone.get(cell) ?? [])];
    const moved: CarState[] = [];
    for (const id of state.dirty.get(cell) ?? []) {
      const car = state.presence.get(id);
      if (car && car.cell === cell) moved.push(car);
    }
    if (moved.length === 0 && left.length === 0) continue;
    const stats = cellStats(state, cell, now);
    // Built only if somebody speaks the compact wire, which after the fleet turns over is
    // everybody, and before it is nearly everybody.
    let entries: CellEntry[] | null = null;
    for (const key of subscribers) {
      const s = state.sockets.get(key);
      if (!s) continue;
      let msg: ServerMsg | null;
      if (s.v >= COMPACT_WIRE_VERSION) {
        entries ??= prepareCell(state, cell, moved, now);
        msg = compactDiff(s, cell, entries, left, stats, now, state);
      } else {
        msg = wholeDiff(state, s, cell, moved, left, stats);
      }
      if (msg) effects.push({ k: 'send', to: key, msg });
    }
  }
  /*
   * A handle costs nothing to mint and would cost memory to keep for ever: without this the
   * table grew by one entry per driver the object had ever seen, which is the same slow leak
   * the daily harvest exists to stop in storage (ADR-0002). Released only after every
   * subscriber has been told, because telling them is what needs the handle.
   */
  for (const ids of state.gone.values())
    for (const id of ids) if (!state.presence.has(id)) state.handles.delete(id);

  state.dirty.clear();
  state.gone.clear();

  const c = state.counters;
  if (c.dirtyKeys.size > 0 && now - c.lastWriteAt >= COUNTER_WRITE_MS) {
    c.lastWriteAt = now;
    const keys = [...c.dirtyKeys].slice(0, MAX_PERSIST_KEYS);
    const entries: [string, number][] = [];
    for (const key of keys) {
      c.dirtyKeys.delete(key);
      const value = counterValue(c, key);
      if (value !== undefined) entries.push([key, value]);
    }
    if (entries.length > 0) effects.push({ k: 'persist', entries });
  }
  return effects;
}

const counterValue = (c: Counters, key: string): number | undefined =>
  key.startsWith('w:')
    ? c.wavesByUser.get(key)
    : key.startsWith('wt:')
      ? c.lastWaveByUser.get(key)
      : c.wavesByCellDay.get(key);

export type Harvest = {
  /** Finished days, one row per cell, for the daily aggregate in D1. */
  cellDays: Array<{ cell: string; day: string; waves: number }>;
  /** Storage keys the hub no longer needs. */
  deleteKeys: string[];
  /** Storage keys to write, bounded like any other flush. */
  persist: [string, number][];
};

/**
 * Once a day, from the Worker cron and never from a message handler: hand over the finished
 * cell-day counters so they can be written to D1, drop them from the hub, and forget drivers
 * who have not waved in USER_WAVES_TTL_MS. Without this the hub's storage grew by one key per
 * cell per day and one per driver ever seen, and a restore that lists ten thousand keys would
 * one day have silently started from zero for everyone past the limit.
 *
 * A `w:` key from before the timestamps has none: it is given one now, and counted from here.
 */
export function harvest(state: HubState, now: number): Harvest {
  const c = state.counters;
  const today = dayKey(now);
  const out: Harvest = { cellDays: [], deleteKeys: [], persist: [] };

  for (const [key, waves] of [...c.wavesByCellDay]) {
    // c:<cell>:<yyyy-mm-dd>
    const [, cell, day] = key.split(':');
    if (!cell || !day || day >= today) continue;
    out.cellDays.push({ cell, day, waves });
    c.wavesByCellDay.delete(key);
    c.dirtyKeys.delete(key);
    out.deleteKeys.push(key);
  }

  for (const key of [...c.wavesByUser.keys()]) {
    const id = key.slice('w:'.length);
    const tsKey = userWaveTsKey(id);
    const ts = c.lastWaveByUser.get(tsKey);
    if (ts === undefined) {
      if (out.persist.length < MAX_PERSIST_KEYS) {
        c.lastWaveByUser.set(tsKey, now);
        out.persist.push([tsKey, now]);
      }
      continue;
    }
    if (now - ts <= USER_WAVES_TTL_MS) continue;
    c.wavesByUser.delete(key);
    c.lastWaveByUser.delete(tsKey);
    c.dirtyKeys.delete(key);
    c.dirtyKeys.delete(tsKey);
    out.deleteKeys.push(key, tsKey);
  }
  return out;
}

/**
 * How many drivers are in these cells, and how many waves they have exchanged today.
 *
 * Counts only. There is nothing here that could locate a person: the same numbers the HUD
 * already shows a connected driver, answered for someone who has not connected yet, so the
 * first screen can say whether there is anyone out there before they decide to join
 * (ADR-0032). A cell this hub does not own is simply absent from the answer.
 */
export function cellCounts(
  state: HubState,
  cells: readonly string[],
  now: number,
): Array<{ cell: string; online: number; wavesToday: number }> {
  const out: Array<{ cell: string; online: number; wavesToday: number }> = [];
  for (const cell of new Set(cells)) {
    if (hubOf(cell) !== state.hub) continue;
    const { online, wavesToday } = cellStats(state, cell, now);
    out.push({ cell, online, wavesToday });
  }
  return out;
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
