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

const GROUND = '#07090c';
const WATER = '#0a1420';
const LAND = '#0a0d12';
const ROAD_MAJOR = '#2b3340';
const ROAD_MID = '#232a35';
const ROAD_MINOR = '#1a2028';
const BOUNDARY = '#232a35';
const LABEL = '#7d8896';
const LABEL_HALO = '#05070a';

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
        paint: { 'fill-color': LAND, 'fill-opacity': 0.6 },
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
        filter: ['in', 'class', 'minor', 'service', 'track'],
        minzoom: 12,
        paint: {
          'line-color': ROAD_MINOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 3],
        },
      },
      {
        id: 'road-secondary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        paint: {
          'line-color': ROAD_MID,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 16, 5],
        },
      },
      {
        id: 'road-primary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'primary', 'trunk'],
        paint: {
          'line-color': ROAD_MAJOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 16, 7],
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'motorway'],
        paint: {
          'line-color': ROAD_MAJOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 16, 9],
        },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['<=', 'admin_level', 2],
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

export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
