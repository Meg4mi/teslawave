/**
 * A per-isolate, per-IP counter. Soft: an isolate forgets on restart and the edge runs many
 * of them, so this bounds a single misbehaving client rather than a fleet. Enough at our
 * scale, and it costs nothing.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED = 10_000;

export function overLimit(name: string, ip: string, limit: number, windowMs: number, now: number): boolean {
  const key = `${name}:${ip}`;
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_TRACKED) buckets.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
