#!/usr/bin/env node
/**
 * The bundle budget from the brief: under 400 kB gzipped, excluding MapLibre.
 * A regression here is a regression in how long a driver stares at a blank screen on LTE.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET_KB = 400;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist', 'assets');

let files;
try {
  files = readdirSync(dist);
} catch {
  console.error('No build found. Run `pnpm build` first.');
  process.exit(1);
}

let total = 0;
const rows = [];
for (const file of files) {
  if (!file.endsWith('.js') && !file.endsWith('.css')) continue;
  const gz = gzipSync(readFileSync(join(dist, file))).length;
  const excluded = file.includes('maplibre');
  if (!excluded) total += gz;
  rows.push({ file, kb: (gz / 1024).toFixed(1), excluded });
}

rows.sort((a, b) => Number(b.kb) - Number(a.kb));
for (const row of rows)
  console.log(`${row.kb.padStart(7)} kB gz  ${row.file}${row.excluded ? '  (maplibre, excluded)' : ''}`);

const totalKb = total / 1024;
console.log(`\n${totalKb.toFixed(1)} kB gzipped excluding MapLibre (budget ${BUDGET_KB} kB)`);
if (totalKb > BUDGET_KB) {
  console.error(`\nOver budget by ${(totalKb - BUDGET_KB).toFixed(1)} kB.`);
  process.exit(1);
}
