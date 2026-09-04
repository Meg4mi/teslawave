import { CELL_PRECISION, HUB_PRECISION, MAX_CELLS_PER_CLIENT } from './constants.js';
import { haversineM } from './motion.js';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/** Standard geohash encoding (bit interleaving, base32). */
export function encode(lat: number, lng: number, precision = CELL_PRECISION): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        bit = (bit << 1) + 1;
        minLng = mid;
      } else {
        bit = bit << 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        bit = (bit << 1) + 1;
        minLat = mid;
      } else {
        bit = bit << 1;
        maxLat = mid;
      }
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[bit];
      bits = 0;
      bit = 0;
    }
  }
  return hash;
}

export function decodeBounds(hash: string): Bounds {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;

  for (const ch of hash) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`invalid geohash character: ${ch}`);
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (bit === 1) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (bit === 1) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function centreOf(hash: string): { lat: number; lng: number } {
  const b = decodeBounds(hash);
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

const wrapLng = (lng: number): number => ((((lng + 180) % 360) + 360) % 360) - 180;

/**
 * The 8 neighbouring cells, computed by encoding the centre of each adjacent box.
 * Exact away from the poles; cells beyond +/-90 latitude simply do not exist and are omitted.
 */
export function neighbours(hash: string): string[] {
  const b = decodeBounds(hash);
  const dLat = b.maxLat - b.minLat;
  const dLng = b.maxLng - b.minLng;
  const cLat = (b.minLat + b.maxLat) / 2;
  const cLng = (b.minLng + b.maxLng) / 2;
  const out: string[] = [];

  for (const oLat of [dLat, 0, -dLat]) {
    for (const oLng of [-dLng, 0, dLng]) {
      if (oLat === 0 && oLng === 0) continue;
      const lat = cLat + oLat;
      if (lat > 90 || lat < -90) continue;
      out.push(encode(lat, wrapLng(cLng + oLng), hash.length));
    }
  }
  return [...new Set(out)];
}

/** Shortest distance from a point to a cell's box, 0 when inside. */
export function distanceToCellM(lat: number, lng: number, hash: string): number {
  const b = decodeBounds(hash);
  const clampedLat = Math.min(Math.max(lat, b.minLat), b.maxLat);
  const clampedLng = Math.min(Math.max(lng, b.minLng), b.maxLng);
  return haversineM(lat, lng, clampedLat, clampedLng);
}

/**
 * The cells to subscribe to: the home cell first, then any neighbour whose box comes
 * within `radiusM`, nearest first, capped at MAX_CELLS_PER_CLIENT.
 */
export function cellsWithin(
  lat: number,
  lng: number,
  radiusM: number,
  precision = CELL_PRECISION,
): string[] {
  const home = encode(lat, lng, precision);
  const near = neighbours(home)
    .map((cell) => ({ cell, d: distanceToCellM(lat, lng, cell) }))
    .filter((n) => n.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((n) => n.cell);
  return [home, ...near].slice(0, MAX_CELLS_PER_CLIENT);
}

/** The Durable Object that owns a cell. */
export const hubOf = (cell: string): string => cell.slice(0, HUB_PRECISION);

/** Group cells by the hub that owns them, so the client opens one socket per hub. */
export function groupByHub(cells: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const cell of cells) {
    const hub = hubOf(cell);
    const list = out.get(hub);
    if (list) list.push(cell);
    else out.set(hub, [cell]);
  }
  return out;
}
