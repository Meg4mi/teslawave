import { createSelfFollower } from './self';
import {
  PRESENCE_EXPIRY_MS,
  TRAIL_MS,
  WAVE_PROMPT_RANGE_M,
  createTrack,
  haversineM,
  pushSample,
  sample,
  type CarState,
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
  cell: string;
  track: EntityTrack;
  trail: TrailPoint[];
  /** Set when the car first appears, so the renderer can play the entry ring once. */
  appearedAt: number;
  lastServerTs: number;
};

/**
 * `placement` is where the sprite goes; `reported` is what the server actually sent. They
 * differ by the display nudge that puts cars back on the road (map/snap.ts). Anything that
 * has to agree with the server — distances, wave range — uses `reported`.
 */
export type RenderCar = WorldCar & { placement: Placement; reported: Placement; distanceM: number };

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

/**
 * Where a car is *drawn* can differ from where the server says it is: the map layer nudges
 * sprites onto the road they are plausibly on, to undo the sideways part of the privacy fuzz
 * (see map/snap.ts). Distances — and therefore the wave prompt — are always measured from the
 * unnudged position, because that is the one the hub validates against.
 */
export type DisplayOffset = {
  lat: number;
  lng: number;
  /** Degrees to add to the drawn heading, so a snapped car lies along its road. */
  turn?: number;
};

let displayOffsetOf: (id: string) => DisplayOffset | null = () => null;

export function setDisplayOffsetSource(source: ((id: string) => DisplayOffset | null) | null): void {
  displayOffsetOf = source ?? ((): null => null);
}

let clockOffset = 0;
let selfId = '';
/**
 * Fixes arrive about once a second; the map redraws sixty times a second. The follower fills
 * in between them so the camera glides and turns instead of stepping (see sim/self.ts).
 */
const follower = createSelfFollower();
let selfPlacement: Placement | null = null;
/** The fuzzed position, which is what the server sees and validates waves against. */
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
 * Distances are measured from here, not from the raw fix: the wave button must appear
 * exactly when the server would accept the wave, and the server only ever sees fuzzed
 * positions. The raw fix is for drawing your own car and nothing else (ADR-0012).
 */
export function setSelfReported(position: { lat: number; lng: number } | null): void {
  selfReported = position;
}

export const getSelfPlacement = (): Placement | null => selfPlacement;

const upsert = (state: CarState, appearedAt: number): void => {
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

export function applyServerMsg(msg: ServerMsg): void {
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
      // The snapshot is the whole truth for these cells. Anyone we still hold there who is
      // not in it left while the socket was down, and would otherwise sit on the map as a
      // ghost until the expiry sweep caught up with them a minute later.
      const present = new Set(msg.snapshot.map((car) => car.id));
      for (const [id, car] of cars)
        if (msg.cells.includes(car.cell) && !present.has(id)) cars.delete(id);
      for (const car of msg.snapshot) upsert(car, now);
      break;
    }
    case 'diff': {
      for (const car of msg.upd) upsert(car, now);
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

/** A hub socket went away: forget the cells it was feeding us. */
export function dropCells(cells: readonly string[]): void {
  for (const cell of cells) cellStats.delete(cell);
  for (const [id, car] of cars) if (cells.includes(car.cell)) cars.delete(id);
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
    // Measured before the display nudge, always.
    const distanceM = from
      ? haversineM(from.lat, from.lng, placement.lat, placement.lng)
      : Number.POSITIVE_INFINITY;
    const offset = displayOffsetOf(car.id);
    const shown = offset
      ? {
          ...placement,
          lat: placement.lat + offset.lat,
          lng: placement.lng + offset.lng,
          heading: (((placement.heading + (offset.turn ?? 0)) % 360) + 360) % 360,
        }
      : placement;
    out.push({ ...car, placement: shown, reported: placement, distanceM });
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
  for (const car of rendered) {
    if (car.distanceM <= 10_000) near++;
    if (car.distanceM <= WAVE_PROMPT_RANGE_M && (!closest || car.distanceM < closest.distanceM))
      closest = car;
  }

  const nearby = closest
    ? {
        id: closest.id,
        model: closest.model,
        colour: closest.colour,
        ...(closest.nick === undefined ? {} : { nick: closest.nick }),
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
