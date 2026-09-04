/**
 * The only place that touches D1 on a schedule. Runs as a Worker cron, not as a Durable
 * Object alarm: an alarm would wake the hub and bill duration for no reason (ADR-0002).
 */
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export async function pruneAndAggregate(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM pairing_codes WHERE expires_at < ?')
    .bind(now - 86_400_000)
    .run();
  // Keep the shareable "waves today" numbers for a week, nothing longer (no history in v1).
  await env.DB.prepare('DELETE FROM daily_stats WHERE day < ?')
    .bind(day(now - 7 * 86_400_000))
    .run();
}

export async function readStats(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT day, SUM(waves) AS waves FROM daily_stats GROUP BY day ORDER BY day DESC LIMIT 7',
  ).all<{ day: string; waves: number }>();
  const total = rows.results.reduce((sum, r) => sum + (r.waves ?? 0), 0);
  return new Response(JSON.stringify({ days: rows.results, total }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}

/** Called by the hub through a normal HTTP request, outside any message handler. */
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
