import { createSelfFollower } from './self';
import {
  CELL_PRECISION,
  POS_INTERVAL_STATIONARY_MS,
  PRESENCE_EXPIRY_MS,
  TRAIL_MS,
  WAVE_PROMPT_RANGE_M,
  WAVE_VALIDATE_RANGE_M,
  createTrack,
  encode,
  haversineM,
  pushSample,
  sample,
  wireToSample,
  type CarMeta,
  type CarState,
  type CarWire,
  type EntityTrack,
  type Placement,
  type ServerMsg,
  type TeslaModel,
} from '@teslawave/protocol';

/**
 * The world is mutable module state, not React state: it changes 60 times a second and only
 * the canvas needs that. React subscribes to a small summary that changes twice a second.
 */
export type TrailPoint = { lat: number; lng: number; at: number };

export type WorldCar = {
  id: string;
  model: TeslaModel;
  colour: string;
  nick?: string;
  waves: number;
  since: number;
  /**
   * The cell the car is in now, from its latest position. The hub states a cell only when
   * it describes a car; after that a car is six numbers a tick, so this is kept from those.
   * It used to be the cell of the description, which is where the car was first met — and
   * a companion driven twenty kilometres since was deleted, mid-drive, the moment that cell
   * fell out of range behind you.
   */
  cell: string;
  /**
   * Which hub told us about this car. A wave goes only to the hub that owns the target, and
   * on the compact wire the car's cell is only re-stated when it changes — so the connection
   * a car arrived on is the more reliable answer, and it is the one we already have.
   */
  hub: string;
  track: EntityTrack;
  trail: TrailPoint[];
  /** Set when the car first appears, so the renderer can play the entry ring once. */
  appearedAt: number;
  lastServerTs: number;
};

/** `placement` is this frame's interpolated position, exactly where the server put the car. */
export type RenderCar = WorldCar & { placement: Placement; distanceM: number };

export type Summary = {
  online: number;
  near: number;
  wavesToday: number;
  lastWaveTs: number | null;
  selfWaves: number;
  nearby: { id: string; model: TeslaModel; colour: string; nick?: string } | null;
  serverNow: number;
};

const SUMMARY_INTERVAL_MS = 500;
const TRAIL_SAMPLE_MS = 500;

const cars = new Map<string, WorldCar>();
const cellStats = new Map<string, { online: number; wavesToday: number; lastWaveTs: number | null }>();
/**
 * The cells we are subscribed to right now. Counts are summed over these only: cellStats
 * used to accumulate every cell ever seen, so "N online" grew all drive as you crossed cells
 * and never came back down.
 */
let subscribed = new Set<string>();
const listeners = new Set<() => void>();

let clockOffset = 0;
let selfId = '';
/**
 * Fixes arrive about once a second; the map redraws sixty times a second. The follower fills
 * in between them so the camera glides and turns instead of stepping (see sim/self.ts).
 */
const follower = createSelfFollower();
let selfPlacement: Placement | null = null;
/** The last fix as it was sent, which is what the server holds and validates waves against. */
let selfReported: { lat: number; lng: number } | null = null;
let selfWaves = 0;
let lastSummaryAt = 0;
let lastTrailAt = 0;
let summary: Summary = {
  online: 0,
  near: 0,
  wavesToday: 0,
  lastWaveTs: null,
  selfWaves: 0,
  nearby: null,
  serverNow: Date.now(),
};

export const serverNow = (): number => Date.now() + clockOffset;

export function resetWorld(id: string): void {
  cars.clear();
  cellStats.clear();
  handles.clear();
  pendingMeta.clear();
  subscribed = new Set();
  selfId = id;
  selfWaves = 0;
  follower.push(null);
  selfPlacement = null;
  selfReported = null;
  clockOffset = 0;
  // The summary is what the HUD reads: leaving a stale one behind would show counts and a
  // wave prompt for a session that no longer exists.
  lastSummaryAt = 0;
  lastTrailAt = 0;
  summary = {
    online: 0,
    near: 0,
    wavesToday: 0,
    lastWaveTs: null,
    selfWaves: 0,
    nearby: null,
    serverNow: Date.now(),
  };
  for (const listener of listeners) listener();
}

export function setSubscribedCells(cells: readonly string[]): void {
  subscribed = new Set(cells);
  for (const cell of [...cellStats.keys()]) if (!subscribed.has(cell)) cellStats.delete(cell);
}

/** A new fix from the device, or null when position goes away. Smoothed before it is drawn. */
export function setSelfPlacement(placement: Placement | null, at = Date.now()): void {
  follower.push(placement ? { ...placement, ts: at } : null);
  selfPlacement = follower.current();
}

/**
 * Distances are measured from here, not from the smoothed placement: the wave button must
 * appear exactly when the server would accept the wave, and the server holds the fix as it
 * was sent, not the eased position the camera follows (ADR-0019).
 */
export function setSelfReported(position: { lat: number; lng: number } | null): void {
  selfReported = position;
}

export const getSelfPlacement = (): Placement | null => selfPlacement;

const upsert = (state: CarState, hub: string, appearedAt: number): void => {
  if (state.id === selfId) {
    selfWaves = state.waves;
    return;
  }
  let car = cars.get(state.id);
  if (!car) {
    car = {
      id: state.id,
      model: state.model,
      colour: state.colour,
      waves: state.waves,
      since: state.since,
      cell: state.cell,
      hub,
      track: createTrack(),
      trail: [],
      appearedAt,
      lastServerTs: state.ts,
      ...(state.nick === undefined ? {} : { nick: state.nick }),
    };
    cars.set(state.id, car);
  }
  car.model = state.model;
  car.colour = state.colour;
  car.waves = state.waves;
  car.cell = state.cell;
  car.hub = hub;
  car.lastServerTs = state.ts;
  if (state.nick === undefined) delete car.nick;
  else car.nick = state.nick;
  pushSample(car.track, {
    lat: state.lat,
    lng: state.lng,
    heading: state.heading,
    speed: state.speed,
    ts: state.ts,
  }, serverNow());
};

/**
 * Which driver each handle stands for, per hub.
 *
 * A handle is a compression, not an identity (ADR-0033): it is only meaningful on the
 * connection that issued it, so two hubs can and will use the same small integers for
 * different drivers. Keyed by hub for exactly that reason.
 *
 * Learned from the `meta` of the diff that first mentions a car and forgotten when the hub
 * says it is gone, or when the connection to that hub goes away.
 */
const handles = new Map<string, Map<number, string>>();

const handleMap = (hub: string): Map<number, string> => {
  let map = handles.get(hub);
  if (!map) {
    map = new Map();
    handles.set(hub, map);
  }
  return map;
};

/**
 * What a handle means, and — for a car we already hold — the static facts that just changed.
 * A car we do not hold yet is created by the tuple that follows in the same message, which
 * is the only place a position exists to create it with.
 */
const applyMeta = (meta: CarMeta, hub: string): void => {
  handleMap(hub).set(meta.h, meta.id);
  const existing = cars.get(meta.id);
  if (!existing) return;
  existing.model = meta.model;
  existing.colour = meta.colour;
  existing.since = meta.since;
  existing.cell = meta.cell;
  existing.hub = hub;
  if (meta.nick === undefined) delete existing.nick;
  else existing.nick = meta.nick;
};

/** One car's motion, by handle. Nothing here can create a car we were never told about. */
const applyWire = (wire: CarWire, hub: string, msgNow: number, appearedAt: number): void => {
  const map = handleMap(hub);
  const id = map.get(wire[0]);
  // A tuple for a handle we were never given a meta for is not something to guess at: it
  // happens when a message is dropped, and the hub re-describes the car on the next tick.
  if (id === undefined || id === selfId) return;
  const sample = wireToSample(wire, msgNow);
  const meta = pendingMeta.get(wire[0]);
  let car = cars.get(id);
  if (!car) {
    if (!meta) return;
    car = {
      id,
      model: meta.model,
      colour: meta.colour,
      waves: wire[5],
      since: meta.since,
      cell: meta.cell,
      hub,
      track: createTrack(),
      trail: [],
      appearedAt,
      lastServerTs: sample.ts,
      ...(meta.nick === undefined ? {} : { nick: meta.nick }),
    };
    cars.set(id, car);
  }
  car.waves = wire[5];
  car.hub = hub;
  car.cell = encode(sample.lat, sample.lng, CELL_PRECISION);
  car.lastServerTs = sample.ts;
  pushSample(car.track, sample, serverNow());
};

/** The metas in the message currently being applied, so a tuple can build a car from one. */
const pendingMeta = new Map<number, CarMeta>();

export function applyServerMsg(msg: ServerMsg, hub: string): void {
  // Animation timings live on the monotonic timeline; sample timestamps live on the server's.
  // Mixing the two freezes every car, so they are never interchanged.
  const now = performance.now();
  switch (msg.t) {
    case 'welcome': {
      // Server time is wall clock; `now` here is the monotonic timeline. Never mix them.
      clockOffset = msg.now - Date.now();
      if (msg.you) selfWaves = msg.you.waves;
      // A welcome is a fresh start for these cells: after a reconnect the counts from before
      // the drop are stale, and keeping them double-counts everyone.
      for (const cell of msg.cells) cellStats.delete(cell);
      // The snapshot restates these cells, but it is not always the whole truth: the hub keeps
      // presence in memory only, and a hibernation wake — which our own reconnect can be what
      // caused — leaves it empty until every driver reports again, up to 30 s for a stopped
      // car (ADR-0002). Deleting whoever is missing made every car around vanish on each
      // reconnect and trickle back one by one. So anyone we hold there who is not in it gets
      // until their next report to show up, then goes: that still clears a driver who left
      // while the socket was down twice as fast as the plain expiry sweep would.
      const present = new Set(msg.snapshot.map((car) => car.id));
      const deadline = serverNow() - (PRESENCE_EXPIRY_MS - POS_INTERVAL_STATIONARY_MS);
      for (const car of cars.values())
        if (msg.cells.includes(car.cell) && !present.has(car.id) && car.lastServerTs > deadline)
          car.lastServerTs = deadline;
      // A welcome resets what the handles on this connection mean: the hub may have restarted
      // since, and its counter starts again from one.
      handles.delete(hub);
      for (const car of msg.snapshot) upsert(car, hub, now);
      break;
    }
    case 'diff2': {
      pendingMeta.clear();
      for (const meta of msg.meta) pendingMeta.set(meta.h, meta);
      for (const meta of msg.meta) applyMeta(meta, hub);
      for (const wire of msg.upd) applyWire(wire, hub, msg.now, now);
      pendingMeta.clear();
      // A departure is already per subscriber on this wire: the hub sends it only when the
      // car has actually left this driver's map, so there is nothing here to second-guess.
      const map = handleMap(hub);
      for (const h of msg.gone) {
        const id = map.get(h);
        map.delete(h);
        if (id !== undefined) cars.delete(id);
      }
      cellStats.set(msg.cell, {
        online: msg.online,
        wavesToday: msg.wavesToday,
        lastWaveTs: msg.lastWaveTs,
      });
      break;
    }
    case 'diff': {
      for (const car of msg.upd) upsert(car, hub, now);
      // "Gone" is per cell. A car crossing a cell border is announced gone from the old cell
      // and updated in the new one, and the hub sends the update first — so a gone that names
      // a cell the car is no longer in is old news, not a departure. Deleting on it blanked
      // every car for a few seconds each time it crossed a border.
      for (const id of msg.gone) if (cars.get(id)?.cell === msg.cell) cars.delete(id);
      cellStats.set(msg.cell, {
        online: msg.online,
        wavesToday: msg.wavesToday,
        lastWaveTs: msg.lastWaveTs,
      });
      break;
    }
    default:
      break;
  }
}

/**
 * We stopped holding these cells: a hub socket went away, or we drove on and the set of
 * cells around us changed. The cars in them go, and with them what their handles meant on
 * that hub — and nothing else. This used to forget every handle the hub had ever given us,
 * which left every car still held on it deaf to its own updates: they dead-reckoned along
 * their last heading until they expired, and only a car newly in range moved again.
 */
export function dropCells(cells: readonly string[], hub?: string): void {
  for (const cell of cells) cellStats.delete(cell);
  const dropped = new Set<string>();
  for (const [id, car] of cars)
    if (cells.includes(car.cell)) {
      cars.delete(id);
      dropped.add(id);
    }
  if (hub === undefined) return;
  const map = handles.get(hub);
  if (!map) return;
  for (const [h, id] of map) if (dropped.has(id)) map.delete(h);
}

export function bumpSelfWaves(): void {
  selfWaves += 1;
}

export const getSelfWaves = (): number => selfWaves;

export function getCar(id: string): WorldCar | undefined {
  return cars.get(id);
}

/**
 * Drop drivers who stopped reporting. The server evicts at the same age; the client does it
 * too so a dropped socket cannot leave ghosts on the map.
 *
 * Called from the render loop and from a wall-clock heartbeat, because browsers stop
 * animation frames on a hidden tab: a backgrounded map used to come back still showing cars
 * that had left minutes earlier.
 */
export function pruneExpired(): number {
  const server = serverNow();
  let removed = 0;
  for (const [id, car] of cars)
    if (server - car.lastServerTs > PRESENCE_EXPIRY_MS) {
      cars.delete(id);
      removed++;
    }
  return removed;
}

/** Render states for the current server time. Does not touch trails, so it is safe to call
 * outside the render loop. */
function placements(server: number): RenderCar[] {
  const out: RenderCar[] = [];
  const from = selfReported ?? selfPlacement;
  for (const car of cars.values()) {
    const placement = sample(car.track, server);
    if (!placement) continue;
    const distanceM = from
      ? haversineM(from.lat, from.lng, placement.lat, placement.lng)
      : Number.POSITIVE_INFINITY;
    out.push({ ...car, placement, distanceM });
  }
  return out;
}

/** Recompute the summary now, outside the render loop. */
export function refreshSummary(): void {
  const server = serverNow();
  lastSummaryAt = 0;
  updateSummary(placements(server), server);
}

/**
 * Called from the render loop. `nowMs` is the monotonic frame time (trails, entry rings);
 * sample interpolation runs on server time.
 */
export function tickWorld(nowMs: number): RenderCar[] {
  const server = serverNow();
  selfPlacement = follower.advance(nowMs, Date.now());
  pruneExpired();
  const out = placements(server);

  if (nowMs - lastTrailAt >= TRAIL_SAMPLE_MS) {
    lastTrailAt = nowMs;
    // `trail` is the same array as on the stored car: the spread copies the reference.
    for (const car of out) {
      car.trail.push({ lat: car.placement.lat, lng: car.placement.lng, at: nowMs });
      while (car.trail.length > 0 && nowMs - (car.trail[0]?.at ?? nowMs) > TRAIL_MS) car.trail.shift();
    }
  }

  if (nowMs - lastSummaryAt >= SUMMARY_INTERVAL_MS) {
    lastSummaryAt = nowMs;
    updateSummary(out, server);
  }
  return out;
}

function updateSummary(rendered: RenderCar[], server: number): void {
  let online = 0;
  let wavesToday = 0;
  let lastWaveTs: number | null = null;
  for (const [cell, stats] of cellStats) {
    if (!subscribed.has(cell)) continue;
    online += stats.online;
    wavesToday += stats.wavesToday;
    if (stats.lastWaveTs !== null && (lastWaveTs === null || stats.lastWaveTs > lastWaveTs))
      lastWaveTs = stats.lastWaveTs;
  }

  let near = 0;
  let closest: RenderCar | null = null;
  /**
   * The car already offered stays offered for as long as the hub would still take the wave
   * (WAVE_VALIDATE_RANGE_M), not only for as long as it would first be offered. Two cars in
   * traffic sit around the prompt range for a long time, and the button used to land and
   * vanish with every metre either side of it; the countdown that means "ten seconds" ran
   * for one. A closer car inside the prompt range still takes the offer over.
   */
  let kept: RenderCar | null = null;
  const offered = summary.nearby?.id;
  for (const car of rendered) {
    if (car.distanceM <= 10_000) near++;
    if (car.distanceM <= WAVE_PROMPT_RANGE_M && (!closest || car.distanceM < closest.distanceM))
      closest = car;
    if (car.id === offered && car.distanceM <= WAVE_VALIDATE_RANGE_M) kept = car;
  }
  const chosen = closest ?? kept;

  const nearby = chosen
    ? {
        id: chosen.id,
        model: chosen.model,
        colour: chosen.colour,
        ...(chosen.nick === undefined ? {} : { nick: chosen.nick }),
      }
    : null;

  const changed =
    summary.online !== online ||
    summary.near !== near ||
    summary.wavesToday !== wavesToday ||
    summary.lastWaveTs !== lastWaveTs ||
    summary.selfWaves !== selfWaves ||
    summary.nearby?.id !== nearby?.id;

  // The "last wave" label ticks, so the summary is refreshed even when nothing else moved.
  summary = { online, near, wavesToday, lastWaveTs, selfWaves, nearby, serverNow: server };
  if (changed || lastWaveTs !== null) for (const listener of listeners) listener();
}

export const getSummary = (): Summary => summary;

export function subscribeSummary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
