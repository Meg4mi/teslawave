/**
 * Where MapLibre's worker is served from. A file of its own with no imports, because both
 * the browser and the Vite plugin that emits the worker need it, and the plugin runs in Node:
 * importing the plugin from client code drags `node:module` into the bundle and breaks the
 * app at runtime.
 */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
