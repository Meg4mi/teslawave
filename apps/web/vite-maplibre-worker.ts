import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Ship MapLibre's tile-parsing worker.
 *
 * MapLibre 6 loads its worker as a separate ES module and builds the URL at runtime
 * (`new URL(`./${name}`, import.meta.url)`), which no bundler can follow statically. The file
 * therefore never reaches the output, the SPA fallback answers the request with index.html,
 * the worker fails to parse, and the map renders nothing at all while every other part of the
 * app works perfectly. That is a hard failure to spot: it looks like an empty map.
 *
 * So we copy the worker and the shared chunk it imports to a stable path, from the installed
 * package so they always match the installed version, and point MapLibre at them. The dev
 * server serves the same path, so development and production fail or work together.
 */
const WORKER = 'maplibre-gl-worker.mjs';
const SHARED = 'maplibre-gl-shared.mjs';
export const MAPLIBRE_WORKER_URL = `/maplibre/${WORKER}`;

const read = (file: string): string => {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
  return readFileSync(join(dist, file), 'utf8');
};

export function maplibreWorker(): Plugin {
  return {
    name: 'teslawave-maplibre-worker',

    generateBundle() {
      for (const file of [WORKER, SHARED])
        this.emitFile({ type: 'asset', fileName: `maplibre/${file}`, source: read(file) });
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = [WORKER, SHARED].find((name) => req.url?.startsWith(`/maplibre/${name}`));
        if (!file) return next();
        res.setHeader('content-type', 'text/javascript');
        res.end(read(file));
      });
    },
  };
}
