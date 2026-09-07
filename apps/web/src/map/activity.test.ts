import { describe, expect, it } from 'vitest';
import { CELL_PRECISION, decodeBounds, encode } from '@teslawave/protocol';
import { activityFeatures } from './activity';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
const OTHER = encode(45.764, 4.8357, CELL_PRECISION); // Lyon

describe('activityFeatures', () => {
  it('draws one box per cell, on the cell', () => {
    const [feature] = activityFeatures([{ cell: CELL, waves: 5 }]);
    const ring = feature?.geometry.coordinates[0] ?? [];
    const bounds = decodeBounds(CELL);
    expect(ring).toHaveLength(5); // closed
    expect(ring[0]?.[0]).toBeCloseTo(bounds.minLng, 6);
    expect(ring[0]?.[1]).toBeCloseTo(bounds.minLat, 6);
    expect(ring[2]?.[0]).toBeCloseTo(bounds.maxLng, 6);
    expect(ring[2]?.[1]).toBeCloseTo(bounds.maxLat, 6);
  });

  it('weighs cells against the busiest one, not against an imagined future', () => {
    // At launch the busiest cell has single-digit waves. A scale pinned to some later volume
    // would render the whole map invisible for the first year, which is the year it matters.
    const features = activityFeatures([
      { cell: CELL, waves: 8 },
      { cell: OTHER, waves: 2 },
    ]);
    expect(features[0]?.properties.weight).toBe(1);
    expect(features[1]?.properties.weight).toBeCloseTo(0.5, 6);
  });

  it('draws nothing when nobody has waved', () => {
    expect(activityFeatures([])).toEqual([]);
    expect(activityFeatures([{ cell: CELL, waves: 0 }])).toEqual([]);
  });

  it('skips a cell id it cannot read rather than throwing', () => {
    // The answer is untrusted like anything else off the wire, and one bad row must not take
    // the map's ground layer with it.
    const features = activityFeatures([
      { cell: 'not a geohash', waves: 3 },
      { cell: CELL, waves: 3 },
    ]);
    expect(features).toHaveLength(1);
  });
});
