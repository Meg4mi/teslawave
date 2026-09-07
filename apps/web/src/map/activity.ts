import type { Map as MlMap } from 'maplibre-gl';
import { decodeBounds } from '@teslawave/protocol';

/**
 * Where the road has been alive this week, as a faint tint over the map cells that have seen
 * waves (ADR-0032).
 *
 * The problem it is against: zoom out on a quiet evening and the map is a dark rectangle with
 * one car on it. Nothing on that screen distinguishes "nobody is driving right now" from
 * "this app has no users", and a driver who reads it as the second one does not come back.
 * The cells that have seen waves say the first thing, honestly, from data that already
 * exists.
 *
 * What it is not: a heat map of where people drive. The source is the nightly per-cell wave
 * aggregate — no positions, no ids, no times, and a cell is 39 x 20 km — so the most it can
 * ever say is "somebody waved somewhere in this box at some point this week" (privacy.md).
 *
 * Only below the zoom where cars are legible. Above that the real cars are the answer, and
 * a tint would be competing with them for a screen the brief reserves for the cars alone.
 */

export type ActivityCell = { cell: string; waves: number };

const SOURCE = 'tw-activity';
const LAYER = 'tw-activity-fill';
/** Above this the cars themselves are the story, so the tint gets out of the way. */
const MAX_ZOOM = 12;
/** Faint on purpose. It should read as ground, never as a thing to look at. */
const MIN_OPACITY = 0.03;
const MAX_OPACITY = 0.1;

type Feature = {
  type: 'Feature';
  properties: { weight: number };
  geometry: { type: 'Polygon'; coordinates: number[][][] };
};

/**
 * One box per cell, weighted 0..1 against the busiest cell in the answer. Relative rather
 * than absolute: at launch the busiest cell has single-digit waves, and a scale pinned to
 * some imagined future volume would render the whole map invisible for the first year.
 */
export function activityFeatures(cells: readonly ActivityCell[]): Feature[] {
  const busiest = cells.reduce((max, c) => Math.max(max, c.waves), 0);
  if (busiest <= 0) return [];
  const out: Feature[] = [];
  for (const { cell, waves } of cells) {
    if (waves <= 0) continue;
    let b;
    try {
      b = decodeBounds(cell);
    } catch {
      continue; // Not a cell id. The answer is untrusted like anything else off the wire.
    }
    // Square root, so one busy city does not flatten every other cell to nothing.
    out.push({
      type: 'Feature',
      properties: { weight: Math.sqrt(waves / busiest) },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [b.minLng, b.minLat],
            [b.maxLng, b.minLat],
            [b.maxLng, b.maxLat],
            [b.minLng, b.maxLat],
            [b.minLng, b.minLat],
          ],
        ],
      },
    });
  }
  return out;
}

const parseCells = (body: unknown): ActivityCell[] => {
  if (typeof body !== 'object' || body === null) return [];
  const { cells } = body as { cells?: unknown };
  if (!Array.isArray(cells)) return [];
  return cells.flatMap((row): ActivityCell[] => {
    if (typeof row !== 'object' || row === null) return [];
    const { cell, waves } = row as { cell?: unknown; waves?: unknown };
    if (typeof cell !== 'string' || typeof waves !== 'number' || !Number.isFinite(waves))
      return [];
    return [{ cell, waves }];
  });
};

/**
 * Fetch the week's activity and paint it under the water and the roads, once.
 *
 * Everything here fails quietly. A map with no tint is the map as it was; a map that says
 * "could not load activity" would be telling a driver about a decoration.
 */
export async function addActivityLayer(map: MlMap): Promise<void> {
  let features: Feature[];
  try {
    const res = await fetch('/api/activity');
    if (!res.ok) return;
    features = activityFeatures(parseCells(await res.json()));
  } catch {
    return;
  }
  if (features.length === 0 || !map.getStyle()) return;
  if (map.getSource(SOURCE)) return;

  map.addSource(SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  });
  map.addLayer(
    {
      id: LAYER,
      type: 'fill',
      source: SOURCE,
      maxzoom: MAX_ZOOM,
      paint: {
        'fill-color': '#6ee7ff',
        'fill-opacity': [
          'interpolate',
          ['linear'],
          ['get', 'weight'],
          0,
          MIN_OPACITY,
          1,
          MAX_OPACITY,
        ],
      },
    },
    // Under the water and the roads: the map has to stay a map. `water` is the first layer
    // above the ground in our style; if it ever goes, the tint lands on top and is still fine.
    map.getLayer('water') ? 'water' : undefined,
  );
}
