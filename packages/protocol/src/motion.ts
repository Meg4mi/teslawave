const R = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Extrapolating further than this is guessing, so we stop. */
export const MAX_DEAD_RECKON_MS = 10_000;
/** Render this far behind server time so there is always a sample to interpolate towards. */
export const RENDER_DELAY_MS = 2_000;
/** A late correction is blended over this long instead of snapping. */
export const CORRECTION_MS = 1_000;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(
  lat: number,
  lng: number,
  headingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  if (distanceM === 0) return { lat, lng };
  const d = distanceM / R;
  const b = toRad(headingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

/** Shortest-arc interpolation, so 350 -> 10 goes forwards through 0. */
export function lerpHeading(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
}

export const kmhToMs = (kmh: number): number => kmh / 3.6;

export type MotionSample = {
  lat: number;
  lng: number;
  heading: number;
  /** km/h */
  speed: number;
  /** server timestamp, ms */
  ts: number;
};

export type Placement = { lat: number; lng: number; heading: number; speed: number };

/** Dead reckoning: where this sample will be at `atMs`, capped so we never invent a journey. */
export function predict(s: MotionSample, atMs: number): Placement {
  const dt = Math.min(Math.max(atMs - s.ts, 0), MAX_DEAD_RECKON_MS);
  const distance = kmhToMs(s.speed) * (dt / 1000);
  const { lat, lng } = destination(s.lat, s.lng, s.heading, distance);
  return { lat, lng, heading: s.heading, speed: s.speed };
}

/** Position at `atMs` from the samples we hold: interpolate inside, dead reckon after. */
export function evaluate(samples: readonly MotionSample[], atMs: number): Placement | null {
  const n = samples.length;
  const first = samples[0];
  const last = samples[n - 1];
  if (!first || !last) return null;
  if (atMs <= first.ts)
    return { lat: first.lat, lng: first.lng, heading: first.heading, speed: first.speed };
  if (n === 1 || atMs >= last.ts) return predict(last, atMs);

  for (let i = 0; i < n - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (!a || !b) continue;
    if (atMs >= a.ts && atMs <= b.ts) {
      const span = b.ts - a.ts;
      const t = span === 0 ? 1 : (atMs - a.ts) / span;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        heading: lerpHeading(a.heading, b.heading, t),
        speed: a.speed + (b.speed - a.speed) * t,
      };
    }
  }
  return predict(last, atMs);
}

export type EntityTrack = {
  samples: MotionSample[];
  /** Offset in degrees, decayed to zero, so a late sample never teleports the car. */
  correction: { lat: number; lng: number; startedAt: number } | null;
  lastRender: { placement: Placement; atMs: number } | null;
};

export const createTrack = (): EntityTrack => ({ samples: [], correction: null, lastRender: null });

/**
 * Add a server sample. If it would move the car away from where it is currently drawn,
 * the difference is recorded as a correction and blended out over CORRECTION_MS.
 */
export function pushSample(track: EntityTrack, s: MotionSample, nowMs: number): void {
  const previous = track.lastRender;
  const known = track.samples.some((x) => x.ts === s.ts);
  if (!known) {
    track.samples.push(s);
    track.samples.sort((a, b) => a.ts - b.ts);
    // Two samples bracket any render time; a third covers reordering.
    if (track.samples.length > 3) track.samples.splice(0, track.samples.length - 3);
  }
  if (previous) {
    const fresh = evaluate(track.samples, previous.atMs);
    if (fresh) {
      const carried = track.correction
        ? decayFactor(track.correction, nowMs)
        : 0;
      const carriedLat = track.correction ? track.correction.lat * carried : 0;
      const carriedLng = track.correction ? track.correction.lng * carried : 0;
      const lat = previous.placement.lat - fresh.lat;
      const lng = previous.placement.lng - fresh.lng;
      if (Math.abs(lat) > 1e-9 || Math.abs(lng) > 1e-9 || carriedLat || carriedLng) {
        track.correction = { lat, lng, startedAt: nowMs };
      }
    }
  }
}

const decayFactor = (c: { startedAt: number }, nowMs: number): number =>
  Math.max(0, 1 - (nowMs - c.startedAt) / CORRECTION_MS);

/** Where to draw this car right now. `serverNow` is client time plus the clock offset. */
export function sample(track: EntityTrack, serverNow: number): Placement | null {
  const atMs = serverNow - RENDER_DELAY_MS;
  const base = evaluate(track.samples, atMs);
  if (!base) return null;
  let placement = base;
  if (track.correction) {
    const k = decayFactor(track.correction, serverNow);
    if (k <= 0) track.correction = null;
    else
      placement = {
        ...base,
        lat: base.lat + track.correction.lat * k,
        lng: base.lng + track.correction.lng * k,
      };
  }
  track.lastRender = { placement, atMs };
  return placement;
}
