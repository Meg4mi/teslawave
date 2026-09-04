import type { StyleSpecification } from 'maplibre-gl';

/**
 * A near-monochrome instrument panel. The cars are the only colour on screen (brief 4.2).
 *
 * Source, glyphs and sprite URLs copied from https://tiles.openfreemap.org/styles/dark on
 * 2026-09-04; the layer list is ours. Fewer than 25 layers, no buildings, no POIs, no 3D,
 * no labels below zoom 12: every layer costs frames on an Intel Atom.
 *
 * Migration path if OpenFreeMap ever limits us: swap `sources` and `glyphs` for a Protomaps
 * PMTiles archive on R2. Nothing else in this file changes (ADR-0006).
 */
const OPENFREEMAP_TILES = 'https://tiles.openfreemap.org/planet';
const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/*
 * Contrast ratios against the ground, measured, not eyeballed. The first version of this
 * palette had roads at 1.2-1.6:1 and water at 1.08:1, which is why the map looked like a
 * black screen with a car on it: it was rendering perfectly and none of it was visible.
 * "Near-monochrome" is a colour decision, not a licence to be invisible.
 */
const GROUND = '#0e1319';
const WATER = '#22405f'; // 1.75:1
const LAND = '#16211a'; // 1.14:1, a hint of green for parks and woodland, not a lawn
const ROAD_MOTORWAY = '#7a8ca8'; // 5.46:1
const ROAD_PRIMARY = '#5f7089'; // 3.70:1
const ROAD_SECONDARY = '#4a586d'; // 2.58:1
const ROAD_MINOR = '#3a4557'; // 1.93:1
const ROAD_CASING = '#161d26';
const BOUNDARY = '#333d4c';
const LABEL = '#aab6c6'; // 9.07:1
const LABEL_HALO = '#080b0f';

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'TeslaWave Night',
    glyphs: OPENFREEMAP_GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: OPENFREEMAP_TILES },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': GROUND } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: { 'fill-color': LAND, 'fill-opacity': 0.8 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': WATER },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track']]],
        minzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_MINOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 3.5],
        },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_SECONDARY,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 16, 5.5],
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_PRIMARY,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 16, 7],
        },
      },
      {
        // One casing, on motorways only: it is what makes the main arteries read as roads
        // rather than as bright lines, and it costs a single extra line layer.
        id: 'road-motorway-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        minzoom: 10,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_CASING,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 13],
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_MOTORWAY,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 16, 9],
        },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 2],
        paint: { 'line-color': BOUNDARY, 'line-width': 0.8, 'line-dasharray': [3, 3] },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', 'class', 'city', 'town'],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
          'text-padding': 12,
        },
        paint: {
          'text-color': LABEL,
          'text-halo-color': LABEL_HALO,
          'text-halo-width': 1.2,
        },
      },
    ],
  };
}

/*
 * Attribution is mandatory and comes from the tile source's own TileJSON, which MapLibre
 * renders for us. Adding a second copy here printed it twice.
 */
