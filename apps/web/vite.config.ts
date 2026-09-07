import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { maplibreWorker } from './vite-maplibre-worker';
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

/** Privacy-friendly page views, and nothing else. No token, no script. */
const analyticsTag = (): string => {
  const token = process.env['VITE_CF_BEACON_TOKEN'];
  if (!token || !/^[a-f0-9]{8,64}$/i.test(token)) return '';
  return (
    '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" ' +
    `data-cf-beacon='{"token":"${token}"}'></script>`
  );
};

/**
 * What a search engine is told the page is. A data block, not a script: the CSP forbids
 * inline script and this is never executed, so it passes (ADR-0034).
 */
const jsonLd = (): string =>
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: brand('name'),
    url: `${brand('url')}/`,
    description: brand('description'),
    image: `${brand('url')}/og.png`,
    applicationCategory: 'SocialNetworkingApplication',
    operatingSystem: 'Any',
    browserRequirements:
      'A current browser with location access. Built for the Tesla in-car browser.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    inLanguage: ['en', 'fr'],
  });

/**
 * The files a crawler or a phone asks for by name. Generated from the brand rather than kept
 * in `public/`, so a rebrand stays a one-file change and the sitemap can never name a domain
 * the page does not.
 */
const generatedFiles = (): Record<string, { type: string; body: string }> => {
  const url = brand('url');
  return {
    'robots.txt': {
      type: 'text/plain',
      body: [
        'User-agent: *',
        'Allow: /',
        // The API answers JSON and the socket answers 426; neither is a page.
        'Disallow: /api/',
        'Disallow: /ws',
        '',
        `Sitemap: ${url}/sitemap.xml`,
        '',
      ].join('\n'),
    },
    'sitemap.xml': {
      type: 'application/xml',
      body: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        '  <url>',
        `    <loc>${url}/</loc>`,
        `    <xhtml:link rel="alternate" hreflang="en" href="${url}/?lang=en"/>`,
        `    <xhtml:link rel="alternate" hreflang="fr" href="${url}/?lang=fr"/>`,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${url}/"/>`,
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
        '  <url>',
        `    <loc>${url}/privacy</loc>`,
        '    <changefreq>monthly</changefreq>',
        '    <priority>0.3</priority>',
        '  </url>',
        '  <url>',
        `    <loc>${url}/terms</loc>`,
        '    <changefreq>monthly</changefreq>',
        '    <priority>0.3</priority>',
        '  </url>',
        '</urlset>',
        '',
      ].join('\n'),
    },
    'manifest.webmanifest': {
      type: 'application/manifest+json',
      body: JSON.stringify(
        {
          id: '/',
          name: brand('name'),
          short_name: brand('name'),
          description: brand('description'),
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // A car screen is landscape and a phone in a dash mount is portrait: both are right.
          orientation: 'any',
          background_color: '#08090b',
          theme_color: '#08090b',
          categories: ['social', 'navigation', 'travel'],
          icons: [
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        null,
        2,
      ),
    },
  };
};

/** The brand string lives in one file; the HTML shell and the crawler files read it from there. */
const brandHtml: Plugin = {
  name: 'teslawave-brand',
  transformIndexHtml(html: string): string {
    return html
      .replaceAll('%BRAND_NAME%', brand('name'))
      .replaceAll('%BRAND_DOMAIN%', brand('domain'))
      .replaceAll('%BRAND_TAGLINE%', brand('tagline'))
      .replaceAll('%BRAND_TITLE%', brand('title'))
      .replaceAll('%BRAND_DESCRIPTION%', brand('description'))
      .replaceAll('%BRAND_IMAGE_ALT%', brand('imageAlt'))
      .replaceAll('%BRAND_DISCLAIMER%', brand('disclaimer'))
      .replaceAll('%BRAND_URL%', brand('url'))
      .replaceAll('%BRAND_JSONLD%', jsonLd())
      .replaceAll('%ANALYTICS%', analyticsTag());
  },
  // In development the files are answered by hand, so the manifest link in the shell resolves.
  configureServer(server) {
    const files = generatedFiles();
    server.middlewares.use((req, res, next) => {
      const file = files[(req.url ?? '').split('?')[0]?.slice(1) ?? ''];
      if (!file) return next();
      res.setHeader('content-type', file.type);
      res.end(file.body);
    });
  },
  generateBundle() {
    for (const [fileName, { body }] of Object.entries(generatedFiles()))
      this.emitFile({ type: 'asset', fileName, source: body });
  },
};

export default defineConfig({
  plugins: [react(), brandHtml, maplibreWorker()],
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
