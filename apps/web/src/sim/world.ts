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
const listeners = new Set<() => void>();

let clockOffset = 0;
let selfId = '';
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
  selfId = id;
  selfWaves = 0;
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

export function setSelfPlacement(placement: Placement | null): void {
  selfPlacement = placement;
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
      for (const car of msg.snapshot) upsert(car, now);
      break;
    }
    case 'diff': {
      for (const car of msg.upd) upsert(car, now);
      for (const id of msg.gone) cars.delete(id);
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
 * Called from the render loop. `nowMs` is the monotonic frame time (trails, entry rings);
 * sample interpolation runs on server time.
 */
export function tickWorld(nowMs: number): RenderCar[] {
  const server = serverNow();
  const out: RenderCar[] = [];
  const trailDue = nowMs - lastTrailAt >= TRAIL_SAMPLE_MS;

  for (const [id, car] of cars) {
    // The server evicts at 60 s; the client does the same so a dropped socket cannot
    // leave ghosts on the map.
    if (server - car.lastServerTs > PRESENCE_EXPIRY_MS) {
      cars.delete(id);
      continue;
    }
    const placement = sample(car.track, server);
    if (!placement) continue;
    if (trailDue) {
      car.trail.push({ lat: placement.lat, lng: placement.lng, at: nowMs });
      while (car.trail.length > 0 && nowMs - (car.trail[0]?.at ?? nowMs) > TRAIL_MS) car.trail.shift();
    }
    const from = selfReported ?? selfPlacement;
    const distanceM = from
      ? haversineM(from.lat, from.lng, placement.lat, placement.lng)
      : Number.POSITIVE_INFINITY;
    out.push({ ...car, placement, distanceM });
  }
  if (trailDue) lastTrailAt = nowMs;

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
  for (const stats of cellStats.values()) {
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
