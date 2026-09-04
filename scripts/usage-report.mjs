#!/usr/bin/env node
/**
 * Yesterday's Cloudflare usage against the free-tier numbers in ADR-0002.
 *
 * The single most important line is Durable Object duration. A hub that is eligible for
 * hibernation costs a few hundred GB-s a day. A hub that is NOT (a timer, a ws.accept(), an
 * in-flight fetch) costs 10,800 GB-s a day per object and would be billed 24/7 on a paid
 * plan. If duration ever approaches that number, an invariant has been broken: find it
 * before doing anything else.
 *
 *   CF_ACCOUNT_ID=... CF_ANALYTICS_TOKEN=... node scripts/usage-report.mjs
 *
 * The token only needs Account Analytics: Read.
 */
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_ANALYTICS_TOKEN;

if (!ACCOUNT || !TOKEN) {
  console.error('CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN are required.');
  process.exit(2);
}

// Free plan, per day (docs/decisions/0002-hub-durable-object-and-cost-model.md).
const LIMITS = {
  doRequests: 100_000,
  doGbSeconds: 13_000,
  workerRequests: 100_000,
};
/** One Durable Object that cannot hibernate, for a whole day, at the billed 128 MB. */
const STUCK_AWAKE_GB_S = (86_400 * 128) / 1024;
const WARN_AT = 0.6;

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const start = day(-1);
const end = day(-1);

const QUERY = `
query Usage($account: String!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      durableObjectsInvocationsAdaptiveGroups(
        limit: 1000, filter: { date_geq: $start, date_leq: $end }
      ) { sum { requests errors } }
      durableObjectsPeriodicGroups(
        limit: 1000, filter: { date_geq: $start, date_leq: $end }
      ) { sum { activeTime storedBytes } }
      workersInvocationsAdaptive(
        limit: 1000, filter: { date_geq: $start, date_leq: $end }
      ) { sum { requests errors } }
    }
  }
}`;

const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { account: ACCOUNT, start, end } }),
});

if (!response.ok) {
  console.error(`Analytics API returned ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const body = await response.json();
if (body.errors?.length) {
  console.error('Analytics API errors:', JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const account = body.data?.viewer?.accounts?.[0] ?? {};
const sumOf = (rows, field) =>
  (rows ?? []).reduce((total, row) => total + (row.sum?.[field] ?? 0), 0);

const doRequests = sumOf(account.durableObjectsInvocationsAdaptiveGroups, 'requests');
const doErrors = sumOf(account.durableObjectsInvocationsAdaptiveGroups, 'errors');
// activeTime is microseconds of wall clock; Durable Objects are billed at 128 MB.
const activeSeconds = sumOf(account.durableObjectsPeriodicGroups, 'activeTime') / 1e6;
const gbSeconds = (activeSeconds * 128) / 1024;
const workerRequests = sumOf(account.workersInvocationsAdaptive, 'requests');
const workerErrors = sumOf(account.workersInvocationsAdaptive, 'errors');

const rows = [
  ['Durable Object requests', doRequests, LIMITS.doRequests],
  ['Durable Object duration (GB-s)', Math.round(gbSeconds), LIMITS.doGbSeconds],
  ['Worker requests', workerRequests, LIMITS.workerRequests],
];

const lines = [`TeslaWave usage for ${start}`, ''];
let worst = 0;
for (const [label, value, limit] of rows) {
  const share = limit > 0 ? value / limit : 0;
  worst = Math.max(worst, share);
  lines.push(
    `${label.padEnd(32)} ${String(value).padStart(9)} / ${String(limit).padStart(7)}  ${(share * 100).toFixed(1)}%`,
  );
}
lines.push('');
lines.push(`Errors: ${doErrors} durable object, ${workerErrors} worker`);

// The invariant check: how many objects look like they never hibernated.
const stuck = gbSeconds / STUCK_AWAKE_GB_S;
lines.push(
  `Duration is equivalent to ${stuck.toFixed(2)} object(s) awake around the clock ` +
    `(${STUCK_AWAKE_GB_S.toFixed(0)} GB-s each).`,
);
if (stuck >= 0.8)
  lines.push(
    'WARNING: that looks like a hub that cannot hibernate. Check for a timer, a ws.accept(), ' +
      'an alarm or an in-flight fetch in apps/worker/src. See ADR-0002.',
  );

const report = lines.join('\n');
console.log(report);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `over_threshold=${worst >= WARN_AT}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `report<<EOF\n${report}\nEOF\n`);
}

if (worst >= WARN_AT) {
  console.error(`\nAt ${(worst * 100).toFixed(0)}% of a free-tier daily limit.`);
  process.exit(1);
}
