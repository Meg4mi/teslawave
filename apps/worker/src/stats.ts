/**
 * The only place that touches D1 on a schedule. Runs as a Worker cron, not as a Durable
 * Object alarm: an alarm would wake the hub and bill duration for no reason (ADR-0002).
 */
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Hubs this Worker isolate has already written down, so the row is written once, not per socket. */
const knownHubs = new Set<string>();

/**
 * The cron has to know which hubs exist to harvest them, and a Durable Object namespace
 * cannot be listed. So the edge writes each hub id down the first time an isolate sees it:
 * one D1 row per hub, ever, and at most one write per hub per isolate lifetime.
 */
export async function rememberHub(env: Env, hub: string, now: number): Promise<void> {
  if (knownHubs.has(hub)) return;
  knownHubs.add(hub);
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO hubs (hub, first_seen) VALUES (?, ?)')
      .bind(hub, now)
      .run();
  } catch {
    // Not migrated yet, or D1 is having a moment: the next isolate will try again.
    knownHubs.delete(hub);
  }
}

/** Harvest every hub in turn, one request each, and write what they hand over into D1. */
async function harvestHubs(env: Env, now: number): Promise<void> {
  const rows = await env.DB.prepare('SELECT hub FROM hubs').all<{ hub: string }>();
  for (const { hub } of rows.results) {
    try {
      const stub = env.HUB.get(env.HUB.idFromName(hub));
      await recordCellDay(env, await stub.harvest(now));
    } catch (error) {
      // One hub's bad day must not stop the others from being harvested.
      console.error(`harvest ${hub} failed`, error);
    }
  }
}

export async function pruneAndAggregate(env: Env, now: number): Promise<void> {
  // An expired code carries a secret nobody can claim any more: gone at the next run.
  await env.DB.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').bind(now).run();
  await harvestHubs(env, now);
  // Keep the shareable "waves today" numbers for a week, nothing longer (no history in v1).
  await env.DB.prepare('DELETE FROM daily_stats WHERE day < ?')
    .bind(day(now - 7 * 86_400_000))
    .run();
}

export async function readStats(env: Env): Promise<Response> {
  let days: Array<{ day: string; waves: number }> = [];
  try {
    const rows = await env.DB.prepare(
      'SELECT day, SUM(waves) AS waves FROM daily_stats GROUP BY day ORDER BY day DESC LIMIT 7',
    ).all<{ day: string; waves: number }>();
    days = rows.results;
  } catch {
    // A database that has not been migrated yet is an empty one, not an outage: this endpoint
    // only feeds a number in the landing copy.
  }
  const total = days.reduce((sum, r) => sum + (r.waves ?? 0), 0);
  return new Response(JSON.stringify({ days, total }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}

/** What a hub handed over at harvest, upserted so a re-run can never double a day. */
export async function recordCellDay(
  env: Env,
  entries: Array<{ day: string; cell: string; waves: number }>,
): Promise<void> {
  if (entries.length === 0) return;
  const stmt = env.DB.prepare(
    'INSERT INTO daily_stats (day, cell, waves) VALUES (?, ?, ?) ' +
      'ON CONFLICT(day, cell) DO UPDATE SET waves = MAX(waves, excluded.waves)',
  );
  await env.DB.batch(entries.map((e) => stmt.bind(e.day, e.cell, e.waves)));
}
