const R = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Extrapolating further than this is guessing, so we stop. */
export const MAX_DEAD_RECKON_MS = 10_000;
/** Render this far behind server time so there is always a sample to interpolate towards. */
export const RENDER_DELAY_MS = 2_000;
/** A late correction is blended over this long instead of snapping. */
export const CORRECTION_MS = 1_000;
/**
 * A render older than this is not "where the car is drawn", it is where it was drawn before
 * the tab went to sleep. Easing from there would slide the car across the map from a spot it
 * left minutes ago, so a sample arriving after a gap places the car and blends nothing.
 */
export const CORRECTION_MAX_GAP_MS = 5_000;

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

/** A turn rate faster than this between two samples is noise, not a road. */
export const MAX_TURN_RATE_DEG_S = 30;
/** Dead reckoning keeps turning for at most this much: a bend, never a loop. */
const MAX_PREDICTED_TURN_DEG = 90;

/** Signed shortest difference b - a, in (-180, 180]. */
const headingDiff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Dead reckoning: where this sample will be at `atMs`, capped so we never invent a journey.
 * With a turn rate (degrees per second, from the last two samples) the car keeps turning at
 * that rate, so a car mid-bend continues round the bend instead of leaving it on a tangent
 * (ADR-0028). The arc is exact: a constant speed and turn rate is a circle, and the chord
 * across `dt` of it has length 2r·sin(θ/2) on a bearing half way round.
 */
export function predict(s: MotionSample, atMs: number, turnRateDegS = 0): Placement {
  const dt = Math.min(Math.max(atMs - s.ts, 0), MAX_DEAD_RECKON_MS) / 1000;
  const distance = kmhToMs(s.speed) * dt;
  const turned = Math.max(-MAX_PREDICTED_TURN_DEG, Math.min(MAX_PREDICTED_TURN_DEG, turnRateDegS * dt));
  if (Math.abs(turned) < 1e-6 || distance === 0) {
    const { lat, lng } = destination(s.lat, s.lng, s.heading, distance);
    return { lat, lng, heading: (s.heading + turned + 360) % 360, speed: s.speed };
  }
  const theta = toRad(turned);
  const radius = distance / Math.abs(theta);
  const chord = 2 * radius * Math.sin(Math.abs(theta) / 2);
  const { lat, lng } = destination(s.lat, s.lng, s.heading + turned / 2, chord);
  return { lat, lng, heading: (s.heading + turned + 360) % 360, speed: s.speed };
}

/** The turn rate the last two samples imply, in degrees per second, clamped to a road's. */
export function turnRate(a: MotionSample, b: MotionSample): number {
  const dt = (b.ts - a.ts) / 1000;
  if (dt <= 0) return 0;
  const rate = headingDiff(a.heading, b.heading) / dt;
  return Math.max(-MAX_TURN_RATE_DEG_S, Math.min(MAX_TURN_RATE_DEG_S, rate));
}

/** A tangent longer than this many chords bends the curve into a loop; a road never does. */
const MAX_TANGENT_CHORDS = 2;

/**
 * Between two samples the car is on the curve their headings and speeds describe, not on
 * the straight line between them: a cubic Hermite with each sample's velocity as its tangent
 * (ADR-0028). On a bend the straight line cut the corner by a car's width or more, which on
 * a map whose roads are drawn to the metre is a car in the verge.
 *
 * Done in a local frame of metres east and north of `a`; at the distances between two
 * samples the Earth is flat enough.
 */
function curveBetween(a: MotionSample, b: MotionSample, t: number): Placement {
  const mPerDegLat = (Math.PI / 180) * R;
  const mPerDegLng = mPerDegLat * Math.cos(toRad(a.lat));
  const px = (b.lng - a.lng) * mPerDegLng;
  const py = (b.lat - a.lat) * mPerDegLat;
  const chord = Math.hypot(px, py);
  const span = (b.ts - a.ts) / 1000;
  const cap = chord * MAX_TANGENT_CHORDS;
  const tangent = (s: MotionSample): [number, number] => {
    const length = Math.min(kmhToMs(s.speed) * span, cap);
    const h = toRad(s.heading);
    return [Math.sin(h) * length, Math.cos(h) * length];
  };
  const [m0x, m0y] = tangent(a);
  const [m1x, m1y] = tangent(b);

  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const x = h10 * m0x + h01 * px + h11 * m1x;
  const y = h10 * m0y + h01 * py + h11 * m1y;
  void h00; // p0 is the origin of the frame

  // The sprite points along the curve, which is where the car is going, not a blend of the
  // two headings; the two agree exactly at either end.
  const d00 = 6 * t2 - 6 * t;
  const d10 = 3 * t2 - 4 * t + 1;
  const d01 = -6 * t2 + 6 * t;
  const d11 = 3 * t2 - 2 * t;
  void d00;
  const dx = d10 * m0x + d01 * px + d11 * m1x;
  const dy = d10 * m0y + d01 * py + d11 * m1y;
  const heading =
    Math.hypot(dx, dy) > 0.5 ? (toDeg(Math.atan2(dx, dy)) + 360) % 360 : lerpHeading(a.heading, b.heading, t);

  return {
    lat: a.lat + y / mPerDegLat,
    lng: a.lng + x / mPerDegLng,
    heading,
    speed: a.speed + (b.speed - a.speed) * t,
  };
}

/** Position at `atMs` from the samples we hold: interpolate inside, dead reckon after. */
export function evaluate(samples: readonly MotionSample[], atMs: number): Placement | null {
  const n = samples.length;
  const first = samples[0];
  const last = samples[n - 1];
  if (!first || !last) return null;
  if (atMs <= first.ts)
    return { lat: first.lat, lng: first.lng, heading: first.heading, speed: first.speed };
  if (n === 1) return predict(last, atMs);
  if (atMs >= last.ts) {
    // Samples arrive every 5 s while we render 2 s behind, so most frames are past the last
    // one: keep turning as the last two samples were, rather than leaving the bend.
    const previous = samples[n - 2];
    return predict(last, atMs, previous ? turnRate(previous, last) : 0);
  }

  for (let i = 0; i < n - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (!a || !b) continue;
    if (atMs >= a.ts && atMs <= b.ts) {
      const span = b.ts - a.ts;
      const t = span === 0 ? 1 : (atMs - a.ts) / span;
      return curveBetween(a, b, t);
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
 * The time we draw this track at. With two or more samples we render RENDER_DELAY_MS behind
 * server time so there is always a sample ahead to interpolate towards; with one there is
 * nothing to interpolate, and rendering in the past would leave a car that has just appeared
 * frozen for two seconds, so it dead-reckons from that sample instead.
 */
const effectiveAt = (track: EntityTrack, serverNow: number): number =>
  track.samples.length > 1 ? serverNow - RENDER_DELAY_MS : serverNow;

/**
 * Add a server sample. If it would move the car away from where it is currently drawn,
 * the difference is recorded as a correction and blended out over CORRECTION_MS.
 */
export function pushSample(track: EntityTrack, s: MotionSample, nowMs: number): void {
  const previous =
    track.lastRender && nowMs - track.lastRender.atMs <= CORRECTION_MAX_GAP_MS + RENDER_DELAY_MS
      ? track.lastRender
      : null;
  const known = track.samples.some((x) => x.ts === s.ts);
  if (!known) {
    track.samples.push(s);
    track.samples.sort((a, b) => a.ts - b.ts);
    // Two samples bracket any render time; a third covers reordering.
    if (track.samples.length > 3) track.samples.splice(0, track.samples.length - 3);
  }
  if (previous) {
    // Compare against where the car would be drawn now, on the new time base: the second
    // sample switches the track from dead reckoning to interpolation, and that switch is
    // itself a discontinuity the correction has to absorb.
    const fresh = evaluate(track.samples, effectiveAt(track, nowMs));
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
  } else if (track.lastRender) {
    // Too long since the last frame: forget the old spot and any correction toward it.
    track.lastRender = null;
    track.correction = null;
  }
}

const decayFactor = (c: { startedAt: number }, nowMs: number): number =>
  Math.max(0, 1 - (nowMs - c.startedAt) / CORRECTION_MS);

/** Where to draw this car right now. `serverNow` is client time plus the clock offset. */
export function sample(track: EntityTrack, serverNow: number): Placement | null {
  const atMs = effectiveAt(track, serverNow);
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
