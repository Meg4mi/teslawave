import { describe, expect, it } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import {
  MAX_SNAP_M,
  createRoadSnapper,
  candidatesFrom,
  headingMismatchDeg,
  nearestOnSegment,
  pickRoad,
  scoreCandidate,
  type Candidate,
} from './snap';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number): number => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/** A straight road through Geneva on the given bearing, offset sideways by `offsetM`. */
const road = (bearingDeg: number, offsetM: number, klass = 'primary', lengthM = 2_000) => {
  const rad = (bearingDeg * Math.PI) / 180;
  const along = { x: Math.sin(rad), y: Math.cos(rad) };
  const across = { x: Math.cos(rad), y: -Math.sin(rad) };
  const kx = mPerDegLng(GENEVA.lat);
  const point = (t: number): number[] => [
    GENEVA.lng + (along.x * t + across.x * offsetM) / kx,
    GENEVA.lat + (along.y * t + across.y * offsetM) / M_PER_DEG_LAT,
  ];
  return {
    geometry: { type: 'LineString' as const, coordinates: [point(-lengthM), point(0), point(lengthM)] },
    properties: { class: klass },
  };
};

describe('nearestOnSegment', () => {
  it('projects onto the segment', () => {
    expect(nearestOnSegment(5, 5, 0, 0, 10, 0)).toEqual({ x: 5, y: 0 });
  });

  it('clamps to the ends rather than running off the line', () => {
    expect(nearestOnSegment(-50, 5, 0, 0, 10, 0)).toEqual({ x: 0, y: 0 });
    expect(nearestOnSegment(50, 5, 0, 0, 10, 0)).toEqual({ x: 10, y: 0 });
  });

  it('survives a zero-length segment', () => {
    expect(nearestOnSegment(3, 4, 1, 1, 1, 1)).toEqual({ x: 1, y: 1 });
  });
});

describe('headingMismatchDeg', () => {
  it('treats a road as usable in both directions', () => {
    expect(headingMismatchDeg(0, 180)).toBe(0);
    expect(headingMismatchDeg(90, 270)).toBe(0);
  });

  it('is worst at a right angle', () => {
    expect(headingMismatchDeg(0, 90)).toBe(90);
    expect(headingMismatchDeg(350, 10)).toBe(20);
  });
});

describe('candidatesFrom', () => {
  it('measures the sideways distance to a road', () => {
    const [candidate] = candidatesFrom([road(0, 75)], GENEVA.lat, GENEVA.lng);
    expect(candidate?.distanceM).toBeCloseTo(75, 0);
    expect(headingMismatchDeg(candidate?.bearingDeg ?? 0, 0)).toBeLessThan(1);
  });

  it('carries the road class through', () => {
    const [candidate] = candidatesFrom([road(90, 30, 'motorway')], GENEVA.lat, GENEVA.lng);
    expect(candidate?.klass).toBe('motorway');
  });

  it('reads MultiLineString as several roads', () => {
    const a = road(0, 40).geometry.coordinates;
    const b = road(0, 90).geometry.coordinates;
    const found = candidatesFrom(
      [{ geometry: { type: 'MultiLineString', coordinates: [a, b] }, properties: { class: 'minor' } }],
      GENEVA.lat,
      GENEVA.lng,
    );
    expect(found.map((c) => Math.round(c.distanceM)).sort((x, y) => x - y)).toEqual([40, 90]);
  });

  it('ignores geometry it does not understand', () => {
    expect(
      candidatesFrom([{ geometry: { type: 'Point', coordinates: [6, 46] } }], GENEVA.lat, GENEVA.lng),
    ).toEqual([]);
  });
});

describe('pickRoad', () => {
  const at = (lat: number, lng: number, heading: number, speed: number, roads: unknown[]) =>
    pickRoad(candidatesFrom(roads as never[], lat, lng), heading, speed);

  it('prefers the road you are pointing along over a nearer one across your path', () => {
    // A slip road 20 m away at right angles, the motorway you are on 80 m away.
    const picked = at(GENEVA.lat, GENEVA.lng, 0, 110, [road(90, 20, 'minor'), road(0, 80, 'motorway')]);
    expect(picked?.klass).toBe('motorway');
    expect(picked?.distanceM).toBeCloseTo(80, 0);
  });

  it('ignores heading when the car is barely moving', () => {
    // Parked: the nearest road wins, whatever the last heading happened to be.
    const picked = at(GENEVA.lat, GENEVA.lng, 0, 2, [road(90, 20, 'minor'), road(0, 80, 'motorway')]);
    expect(picked?.klass).toBe('minor');
  });

  it('prefers the motorway when the car is doing motorway speed', () => {
    const picked = at(GENEVA.lat, GENEVA.lng, 0, 120, [road(0, 40, 'minor'), road(0, 60, 'motorway')]);
    expect(picked?.klass).toBe('motorway');
  });

  it('takes the parallel service road when the car is crawling', () => {
    const picked = at(GENEVA.lat, GENEVA.lng, 0, 30, [road(0, 40, 'minor'), road(0, 60, 'motorway')]);
    expect(picked?.klass).toBe('minor');
  });

  it('invents nothing when there is no road within reach', () => {
    expect(at(GENEVA.lat, GENEVA.lng, 0, 90, [road(0, MAX_SNAP_M + 40)])).toBeNull();
    expect(at(GENEVA.lat, GENEVA.lng, 0, 90, [])).toBeNull();
  });

  it('never moves a car further than the fuzz could have', () => {
    const picked = at(GENEVA.lat, GENEVA.lng, 45, 70, [road(45, MAX_SNAP_M - 1)]);
    expect(picked?.distanceM).toBeLessThanOrEqual(MAX_SNAP_M);
  });
});

describe('scoreCandidate', () => {
  const base: Candidate = { lat: 0, lng: 0, distanceM: 50, bearingDeg: 0, klass: 'primary' };

  it('is the plain distance for a car that is not moving', () => {
    expect(scoreCandidate(base, 90, 0)).toBe(50);
  });

  it('penalises a road running across your heading', () => {
    expect(scoreCandidate({ ...base, bearingDeg: 90 }, 0, 60)).toBeGreaterThan(
      scoreCandidate(base, 0, 60),
    );
  });
});

/**
 * A map that renders one straight road 75 m north of Geneva, so the snapper has something to
 * find. `project` is a plain equirectangular metres-to-pixels, which is all the snapper uses
 * it for (sizing its query box).
 */
const fakeMap = (roads: unknown[]): MlMap =>
  ({
    getZoom: () => 15.5,
    getLayer: (id: string) => ({ id }),
    getCanvas: () => ({ clientWidth: 1_920, clientHeight: 1_200 }),
    // Metres to pixels, with the car near the middle of the screen.
    project: ([lng, lat]: [number, number]) => ({
      x: 960 + (lng - GENEVA.lng) * mPerDegLng(GENEVA.lat) * 0.4,
      y: 600 - (lat - GENEVA.lat) * M_PER_DEG_LAT * 0.4,
    }),
    queryRenderedFeatures: () => roads,
  }) as unknown as MlMap;

/** `road(bearing, offset)` puts the road to the right of the bearing, so bearing 0 is east. */
const metresEast = (offset: { lat: number; lng: number } | null): number =>
  (offset?.lng ?? 0) * mPerDegLng(GENEVA.lat);

const target = (over: Partial<{ lat: number; lng: number; heading: number; speed: number }> = {}) => ({
  id: 'other',
  reported: { lat: GENEVA.lat, lng: GENEVA.lng, heading: 0, speed: 90, ...over },
});

describe('createRoadSnapper', () => {
  it('snaps a car on the first pass rather than a whole interval later', () => {
    const snapper = createRoadSnapper(fakeMap([road(0, 75)]));
    const car = target();
    // One frame in, the correction is already on its way; it used to sit at zero for the
    // whole re-snap interval, so a car that had just appeared spent it in a field.
    for (let t = 0; t < 400; t += 16) snapper.update([car], t);
    expect(metresEast(snapper.offsetOf('other'))).toBeGreaterThan(50);
  });

  it('eases onto the road instead of jumping there', () => {
    const snapper = createRoadSnapper(fakeMap([road(0, 75)]));
    const car = target();
    snapper.update([car], 0);
    // The first frame has barely moved: a sprite that teleports 75 m reads as a glitch.
    expect(Math.abs(metresEast(snapper.offsetOf('other')))).toBeLessThan(20);

    for (let t = 16; t < 2_000; t += 16) snapper.update([car], t);
    expect(metresEast(snapper.offsetOf('other'))).toBeCloseTo(75, 0);
  });

  it('does not walk the car down the road over many re-snaps', () => {
    const snapper = createRoadSnapper(fakeMap([road(0, 75)]));
    const car = target();
    // Ten re-snaps' worth. The offset is measured from the reported position every time, so
    // it lands on the same place rather than adding itself to itself.
    for (let t = 0; t < 8_000; t += 16) snapper.update([car], t);
    expect(metresEast(snapper.offsetOf('other'))).toBeCloseTo(75, 0);
  });

  it('leaves a car alone when there is no road within reach', () => {
    const snapper = createRoadSnapper(fakeMap([road(0, 400)]));
    for (let t = 0; t < 2_000; t += 16) snapper.update([target()], t);
    expect(metresEast(snapper.offsetOf('other'))).toBeCloseTo(0, 1);
  });

  it('forgets cars that have gone', () => {
    const snapper = createRoadSnapper(fakeMap([road(0, 75)]));
    snapper.update([target()], 0);
    expect(snapper.offsetOf('other')).not.toBeNull();
    snapper.update([], 10_000);
    expect(snapper.offsetOf('other')).toBeNull();
  });
});
