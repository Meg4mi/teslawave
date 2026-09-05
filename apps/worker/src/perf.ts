import { overLimit } from './limits.js';

/**
 * Anonymous frame timings from drivers who opted in (ADR-0027). One row per report, pruned
 * after 30 days. Nothing here can locate or name anyone: the validator is the schema, and it
 * drops any field it does not know.
 */
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Ten a minute is far more than a client sends (one every ten minutes). */
const PERF_LIMIT = 10;
const PERF_WINDOW_MS = 60_000;
export const PERF_RETENTION_MS = 30 * 86_400_000;

type Sample = {
  dpr: number;
  tesla: boolean;
  chromium: number;
  width: number;
  height: number;
  mean: number;
  p95: number;
  samples: number;
  halfRate: boolean;
  lowRes: boolean;
  cars: number;
};

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

export function readSample(body: unknown): Sample | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b['v'] !== 1) return null;
  const dpr = num(b['dpr'], 0.5, 8);
  const chromium = num(b['chromium'], 0, 1_000);
  const width = num(b['width'], 1, 10_000);
  const height = num(b['height'], 1, 10_000);
  const mean = num(b['mean'], 0, 10_000);
  const p95 = num(b['p95'], 0, 10_000);
  const samples = num(b['samples'], 1, 100_000);
  const cars = num(b['cars'], 0, 10_000);
  if (
    dpr === null ||
    chromium === null ||
    width === null ||
    height === null ||
    mean === null ||
    p95 === null ||
    samples === null ||
    cars === null
  )
    return null;
  return {
    dpr,
    tesla: b['tesla'] === true,
    chromium,
    width,
    height,
    mean,
    p95,
    samples,
    halfRate: b['halfRate'] === true,
    lowRes: b['lowRes'] === true,
    cars,
  };
}

export async function recordPerf(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (overLimit('perf', ip, PERF_LIMIT, PERF_WINDOW_MS, now)) return json({ error: 'too many' }, 429);
  const sample = readSample(await request.json().catch(() => null));
  if (!sample) return json({ error: 'bad sample' }, 400);
  await env.DB.prepare(
    'INSERT INTO perf_samples (at, dpr, tesla, chromium, width, height, mean_ms, p95_ms, samples, half_rate, low_res, cars) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      now,
      sample.dpr,
      sample.tesla ? 1 : 0,
      sample.chromium,
      sample.width,
      sample.height,
      sample.mean,
      sample.p95,
      sample.samples,
      sample.halfRate ? 1 : 0,
      sample.lowRes ? 1 : 0,
      sample.cars,
    )
    .run();
  return new Response(null, { status: 204 });
}

export async function prunePerf(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM perf_samples WHERE at < ?').bind(now - PERF_RETENTION_MS).run();
}
