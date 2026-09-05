#!/usr/bin/env node
/**
 * What real screens say about the frame budget, from the anonymous samples drivers opted in
 * to send (ADR-0027). CI has no GPU, so this is the only performance data that counts
 * beyond a row written by hand in docs/tesla-notes.md.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/perf-report.mjs [days]
 *
 * Reads the remote D1 database through wrangler; nothing is written.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const days = Number(process.argv[2] ?? 7);
const since = Date.now() - days * 86_400_000;

/** The gate the e2e perf spec uses for our own per-frame work, in ms. */
const BUDGET_MEAN_MS = 8;

const SQL = `
SELECT tesla, dpr, width, height, chromium,
       COUNT(*) AS reports,
       ROUND(AVG(mean_ms), 2) AS mean_ms,
       ROUND(AVG(p95_ms), 2) AS p95_ms,
       ROUND(AVG(cars), 1) AS cars,
       ROUND(100.0 * SUM(half_rate) / COUNT(*)) AS half_rate_pct,
       ROUND(100.0 * SUM(low_res) / COUNT(*)) AS low_res_pct
FROM perf_samples
WHERE at > ${since}
GROUP BY tesla, dpr, width, height, chromium
ORDER BY tesla DESC, reports DESC`;

const raw = execFileSync(
  'pnpm',
  ['--filter', '@teslawave/worker', 'exec', 'wrangler', 'd1', 'execute', 'teslawave', '--remote', '--json', '--command', SQL],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
const start = raw.indexOf('[');
const rows = start >= 0 ? (JSON.parse(raw.slice(start))[0]?.results ?? []) : [];

console.log(`Frame budget on real screens, last ${days} day(s): ${rows.length} kind(s) of screen\n`);
if (rows.length === 0) {
  console.log('No samples yet. A driver has to turn on "Share performance data" in Settings.');
  process.exit(0);
}

const header = ['screen', 'dpr', 'size', 'chromium', 'reports', 'mean ms', 'p95 ms', 'cars', '30fps %', 'lowres %'];
const lines = [header];
for (const r of rows) {
  lines.push([
    r.tesla ? 'Tesla' : 'other',
    String(r.dpr),
    `${r.width}x${r.height}`,
    String(r.chromium),
    String(r.reports),
    `${r.mean_ms}${r.mean_ms > BUDGET_MEAN_MS ? ' !' : ''}`,
    String(r.p95_ms),
    String(r.cars),
    String(r.half_rate_pct),
    String(r.low_res_pct),
  ]);
}
const widths = header.map((_, i) => Math.max(...lines.map((l) => l[i].length)));
for (const line of lines) console.log(line.map((cell, i) => cell.padEnd(widths[i])).join('  '));
console.log(`\n"!" marks a mean over the ${BUDGET_MEAN_MS} ms budget the e2e perf spec gates on.`);
