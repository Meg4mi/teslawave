import { describe, expect, it } from 'vitest';
import {
  cellsWithin,
  centreOf,
  decodeBounds,
  distanceToCellM,
  encode,
  groupByHub,
  hubOf,
  neighbours,
} from '../src/geohash.js';
import { CELL_PRECISION, HUB_PRECISION, MAX_CELLS_PER_CLIENT } from '../src/constants.js';
import { haversineM } from '../src/motion.js';

const GENEVA = { lat: 46.2044, lng: 6.1432 };

describe('encode', () => {
  it('matches published vectors', () => {
    expect(encode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encode(0, 0, 4)).toBe('s000');
    expect(encode(-90, -180, 4)).toBe('0000');
    expect(encode(90, 180, 4)).toBe('zzzz');
  });

  it('puts the launch region in hub u0', () => {
    expect(encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION).startsWith('u0')).toBe(true);
    // Lausanne, Annecy and Zurich share the same hub.
    expect(hubOf(encode(46.5197, 6.6323, CELL_PRECISION))).toBe('u0');
    expect(hubOf(encode(45.8992, 6.1294, CELL_PRECISION))).toBe('u0');
    expect(hubOf(encode(47.3769, 8.5417, CELL_PRECISION))).toBe('u0');
  });

  it('round-trips through decodeBounds', () => {
    const hash = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const b = decodeBounds(hash);
    expect(GENEVA.lat).toBeGreaterThanOrEqual(b.minLat);
    expect(GENEVA.lat).toBeLessThanOrEqual(b.maxLat);
    expect(GENEVA.lng).toBeGreaterThanOrEqual(b.minLng);
    expect(GENEVA.lng).toBeLessThanOrEqual(b.maxLng);
    expect(encode(centreOf(hash).lat, centreOf(hash).lng, CELL_PRECISION)).toBe(hash);
  });

  it('produces cells of about 39 x 19.5 km at precision 4', () => {
    const b = decodeBounds(encode(GENEVA.lat, GENEVA.lng, 4));
    const width = haversineM(GENEVA.lat, b.minLng, GENEVA.lat, b.maxLng);
    const height = haversineM(b.minLat, GENEVA.lng, b.maxLat, GENEVA.lng);
    expect(width).toBeGreaterThan(20_000);
    expect(width).toBeLessThan(45_000);
    expect(height).toBeGreaterThan(15_000);
    expect(height).toBeLessThan(25_000);
  });
});

describe('neighbours', () => {
  it('returns 8 distinct cells that surround the origin', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const n = neighbours(home);
    expect(n).toHaveLength(8);
    expect(new Set(n).size).toBe(8);
    expect(n).not.toContain(home);
    for (const cell of n) {
      expect(cell).toHaveLength(CELL_PRECISION);
      expect(distanceToCellM(GENEVA.lat, GENEVA.lng, cell)).toBeLessThan(45_000);
    }
  });

  it('is symmetric: every neighbour has the origin as a neighbour', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    for (const cell of neighbours(home)) expect(neighbours(cell)).toContain(home);
  });

  it('omits cells beyond the poles', () => {
    expect(neighbours(encode(89.9, 0, 4)).length).toBeLessThan(8);
  });
});

describe('cellsWithin', () => {
  it('returns only the home cell when no edge is within the radius', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const c = centreOf(home);
    // A precision-4 cell is ~19.5 km tall, so from its centre the north and south edges
    // sit at ~9.75 km: at the product radius of 10 km a driver in the middle of a cell
    // legitimately subscribes to three cells. Shrink the radius to isolate the home cell.
    expect(cellsWithin(c.lat, c.lng, 1_000, CELL_PRECISION)).toEqual([home]);
    expect(cellsWithin(c.lat, c.lng, 10_000, CELL_PRECISION)[0]).toBe(home);
  });

  it('returns exactly the cells whose box is within the radius, nearest first', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const cells = cellsWithin(GENEVA.lat, GENEVA.lng, 10_000, CELL_PRECISION);
    expect(cells[0]).toBe(home);
    const distances = cells.map((c) => distanceToCellM(GENEVA.lat, GENEVA.lng, c));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    for (const d of distances) expect(d).toBeLessThanOrEqual(10_000);
    const expected = [home, ...neighbours(home)].filter(
      (c) => distanceToCellM(GENEVA.lat, GENEVA.lng, c) <= 10_000,
    );
    expect(cells).toEqual(expected.slice(0, MAX_CELLS_PER_CLIENT));
  });

  it('adds the neighbour when close to an edge, home cell first', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const b = decodeBounds(home);
    const nearEdge = { lat: (b.minLat + b.maxLat) / 2, lng: b.maxLng - 0.01 };
    const cells = cellsWithin(nearEdge.lat, nearEdge.lng, 10_000, CELL_PRECISION);
    expect(cells[0]).toBe(home);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_CLIENT);
  });

  it('caps at MAX_CELLS_PER_CLIENT at a corner', () => {
    const home = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
    const b = decodeBounds(home);
    const cells = cellsWithin(b.maxLat - 0.001, b.maxLng - 0.001, 10_000, CELL_PRECISION);
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS_PER_CLIENT);
    expect(cells[0]).toBe(home);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe('hubOf / groupByHub', () => {
  it('truncates to HUB_PRECISION', () => {
    expect(hubOf('u0gz')).toBe('u0');
    expect(hubOf('u0gz')).toHaveLength(HUB_PRECISION);
  });

  it('groups cells by owning hub', () => {
    const grouped = groupByHub(['u0gz', 'u0gy', 'sp3e']);
    expect([...grouped.keys()].sort()).toEqual(['sp', 'u0']);
    expect(grouped.get('u0')).toEqual(['u0gz', 'u0gy']);
  });
});
