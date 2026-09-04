import type { Map as MlMap } from 'maplibre-gl';

/**
 * Other drivers are drawn beside the road, in fields and car parks, and it looks broken.
 *
 * That is the privacy fuzz doing its job: every position is offset 50–100 m before it leaves
 * the car it belongs to (ADR-0004), and 75 m sideways on a motorway is a field. The fix is not
 * to fuzz less — it is to put the *drawing* back on a road, while the number we send, store and
 * validate waves against stays exactly as fuzzed as it was.
 *
 * So this is a display transform and nothing more: for each car we look at the roads actually
 * rendered around it, pick the one it is most plausibly on, and move the sprite there. The
 * along-the-road error, which is most of the 50–100 m, is untouched — you still cannot tell
 * where on the road someone is. See ADR-0016.
 */

const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number): number => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/** Beyond this we would be inventing a road rather than correcting for the fuzz. */
export const MAX_SNAP_M = 130;
/** Below this the fuzz is under a pixel or two and minor roads are not even rendered. */
const MIN_SNAP_ZOOM = 13;
/** Under this the car could be anywhere — parked, in traffic — so heading means nothing. */
const HEADING_SPEED_KMH = 12;
/** Over this it is not on a residential street, whatever the geometry says. */
const FAST_SPEED_KMH = 80;

const ROAD_LAYERS = ['road-motorway', 'road-primary', 'road-secondary', 'road-minor'];

export type Offset = { lat: number; lng: number };
export type Candidate = { lat: number; lng: number; distanceM: number; bearingDeg: number; klass: string };

/** Nearest point on segment a→b to p, all in metres, plus how far along it landed. */
export function nearestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { x: ax + t * dx, y: ay + t * dy };
}

/** How far apart two undirected road bearings are, 0–90°. A road serves both directions. */
export function headingMismatchDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 180) + 180) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Score is "metres, adjusted for how much sense this road makes". A car doing 110 km/h due
 * north is not on the perpendicular slip road 20 m away, and it is not on a farm track.
 */
export function scoreCandidate(candidate: Candidate, headingDeg: number, speedKmh: number): number {
  let score = candidate.distanceM;
  if (speedKmh >= HEADING_SPEED_KMH)
    score *= 1 + (3 * headingMismatchDeg(candidate.bearingDeg, headingDeg)) / 90;
  if (speedKmh >= FAST_SPEED_KMH)
    score *=
      candidate.klass === 'motorway' || candidate.klass === 'trunk'
        ? 0.6
        : candidate.klass === 'primary'
          ? 0.85
          : 1.4;
  return score;
}

/** The best road for a car at this position, or null if none is close enough to be honest. */
export function pickRoad(
  candidates: readonly Candidate[],
  headingDeg: number,
  speedKmh: number,
): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate.distanceM > MAX_SNAP_M) continue;
    const score = scoreCandidate(candidate, headingDeg, speedKmh);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

type LineGeometry =
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] };

/** Closest point on each rendered road line, in geographic coordinates. */
export function candidatesFrom(
  features: readonly { geometry: unknown; properties?: Record<string, unknown> | null }[],
  lat: number,
  lng: number,
): Candidate[] {
  const kx = mPerDegLng(lat);
  const out: Candidate[] = [];
  for (const feature of features) {
    const geometry = feature.geometry as LineGeometry | undefined;
    if (!geometry) continue;
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    const klass = String(feature.properties?.['class'] ?? '');
    for (const line of lines) {
      let bestD = Infinity;
      let best: { lat: number; lng: number; bearingDeg: number } | null = null;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const b = line[i];
        if (!a || !b || a.length < 2 || b.length < 2) continue;
        const ax = ((a[0] as number) - lng) * kx;
        const ay = ((a[1] as number) - lat) * M_PER_DEG_LAT;
        const bx = ((b[0] as number) - lng) * kx;
        const by = ((b[1] as number) - lat) * M_PER_DEG_LAT;
        const p = nearestOnSegment(0, 0, ax, ay, bx, by);
        const d = Math.hypot(p.x, p.y);
        if (d >= bestD) continue;
        bestD = d;
        best = {
          lat: lat + p.y / M_PER_DEG_LAT,
          lng: lng + p.x / kx,
          bearingDeg: (Math.atan2(bx - ax, by - ay) * 180) / Math.PI,
        };
      }
      if (best) out.push({ ...best, distanceM: bestD, klass });
    }
  }
  return out;
}

/**
 * Shaped like a RenderCar so the render loop passes its array straight through — and it is
 * deliberately `reported`, the position the server sent, not `placement`, the one we drew.
 * Snapping a position we had already snapped would compound the correction on every pass and
 * walk the car down the road.
 */
export type SnapTarget = {
  id: string;
  reported: { lat: number; lng: number; heading: number; speed: number };
};

export type RoadSnapper = {
  /** The correction to add to a car's position before drawing it. Never the wire position. */
  offsetOf: (id: string) => Offset | null;
  /** Advance the easing and re-snap a couple of cars. Call once per frame. */
  update: (cars: readonly SnapTarget[], nowMs: number, budget?: number) => void;
  reset: () => void;
};

type Entry = {
  cur: Offset;
  target: Offset;
  snappedAt: number;
  seenAt: number;
};

/** Slow enough that a re-snap slides rather than jumps, fast enough to keep up at speed. */
const EASE_TAU_MS = 200;
/**
 * Roads do not move; the car does, so this only has to keep up with the car — and the query
 * behind it is the one genuinely expensive thing on the frame. At 130 km/h a car covers 45 m
 * between passes, which the easing absorbs.
 */
const RESNAP_MS = 1_200;
/** Off-screen cars are not worth a query: nothing is rendered out there to snap to anyway. */
const VIEW_MARGIN_PX = 120;

export function createRoadSnapper(map: MlMap): RoadSnapper {
  const entries = new Map<string, Entry>();
  let cursor = 0;
  let lastFrame = 0;

  const query = (target: { lat: number; lng: number; heading: number; speed: number }): Offset => {
    // The pixel box that covers MAX_SNAP_M here, measured rather than assumed: metres per
    // pixel depend on zoom and latitude, and the car screen's density is not ours to guess.
    const centre = map.project([target.lng, target.lat]);
    const north = map.project([target.lng, target.lat + MAX_SNAP_M / M_PER_DEG_LAT]);
    const radius = Math.max(8, Math.abs(centre.y - north.y), Math.abs(centre.x - north.x));
    let features;
    try {
      features = map.queryRenderedFeatures(
        [
          [centre.x - radius, centre.y - radius],
          [centre.x + radius, centre.y + radius],
        ],
        { layers: ROAD_LAYERS.filter((id) => map.getLayer(id)) },
      );
    } catch {
      // A style reload mid-query: nothing to snap to this time round.
      return { lat: 0, lng: 0 };
    }
    const road = pickRoad(
      candidatesFrom(features, target.lat, target.lng),
      target.heading,
      target.speed,
    );
    if (!road) return { lat: 0, lng: 0 };
    return { lat: road.lat - target.lat, lng: road.lng - target.lng };
  };

  return {
    offsetOf: (id) => entries.get(id)?.cur ?? null,

    update(cars, nowMs, budget = 2) {
      const dt = lastFrame === 0 ? 16 : Math.min(200, nowMs - lastFrame);
      lastFrame = nowMs;
      const k = 1 - Math.exp(-dt / EASE_TAU_MS);
      const zoom = map.getZoom();
      const snapping = zoom >= MIN_SNAP_ZOOM;

      for (const car of cars) {
        let entry = entries.get(car.id);
        if (!entry) {
          // Never snapped, rather than snapped at time zero: a car that has just appeared
          // must be put on its road on the next pass, not a second and a bit later.
          entry = {
            cur: { lat: 0, lng: 0 },
            target: { lat: 0, lng: 0 },
            snappedAt: -Infinity,
            seenAt: nowMs,
          };
          entries.set(car.id, entry);
        }
        entry.seenAt = nowMs;
        if (!snapping) entry.target = { lat: 0, lng: 0 };
        entry.cur = {
          lat: entry.cur.lat + (entry.target.lat - entry.cur.lat) * k,
          lng: entry.cur.lng + (entry.target.lng - entry.cur.lng) * k,
        };
      }

      for (const [id, entry] of entries) if (nowMs - entry.seenAt > 5_000) entries.delete(id);
      if (!snapping || cars.length === 0) return;

      // A couple of cars per frame, round robin. queryRenderedFeatures is the one thing here
      // that could cost real time on an Intel Atom, so it is rationed rather than trusted.
      const canvas = map.getCanvas();
      for (let n = 0; n < budget; n++) {
        const car = cars[cursor++ % cars.length];
        if (!car) break;
        const entry = entries.get(car.id);
        if (!entry || nowMs - entry.snappedAt < RESNAP_MS) continue;
        entry.snappedAt = nowMs;
        const point = map.project([car.reported.lng, car.reported.lat]);
        const offscreen =
          point.x < -VIEW_MARGIN_PX ||
          point.y < -VIEW_MARGIN_PX ||
          point.x > canvas.clientWidth + VIEW_MARGIN_PX ||
          point.y > canvas.clientHeight + VIEW_MARGIN_PX;
        // Keep whatever correction it already had rather than un-snapping it, so it does not
        // jump sideways the moment it scrolls back into view.
        if (!offscreen) entry.target = query(car.reported);
      }
    },

    reset() {
      entries.clear();
      cursor = 0;
      lastFrame = 0;
    },
  };
}
