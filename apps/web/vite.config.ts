import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Read as JSON rather than importing the package: the config is loaded by Node directly,
// outside Vite's resolver, and this keeps one source of truth for the brand.
const BRAND = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../packages/protocol/src/brand.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, string | undefined>;

const brand = (key: string): string => BRAND[key] ?? '';

/** The brand string lives in one file; the HTML shell reads it from there. */
const brandHtml = {
  name: 'teslawave-brand',
  transformIndexHtml(html: string): string {
    return html
      .replaceAll('%BRAND_NAME%', brand('name'))
      .replaceAll('%BRAND_TITLE%', brand('title'))
      .replaceAll('%BRAND_DESCRIPTION%', brand('description'))
      .replaceAll('%BRAND_URL%', brand('url'));
  },
};

export default defineConfig({
  plugins: [react(), brandHtml],
  build: {
    target: 'es2022',
    cssTarget: 'chrome120',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
