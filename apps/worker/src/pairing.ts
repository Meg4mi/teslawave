import {
  PAIR_TTL_MS,
  generateCode,
  isColourId,
  isModel,
  isValidCode,
  normaliseCode,
  NICK_MAX_LEN,
} from '@teslawave/protocol';

export type PairPayload = { id: string; model: string; colour: string; nick?: string };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Per-isolate soft limit. Enough at our scale, and it costs nothing. */
const claims = new Map<string, { count: number; resetAt: number }>();
const CLAIM_LIMIT = 10;
const CLAIM_WINDOW_MS = 60_000;

const overClaimLimit = (ip: string, now: number): boolean => {
  const entry = claims.get(ip);
  if (!entry || now > entry.resetAt) {
    claims.set(ip, { count: 1, resetAt: now + CLAIM_WINDOW_MS });
    if (claims.size > 10_000) claims.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > CLAIM_LIMIT;
};

const readPayload = (body: unknown): PairPayload | null => {
  if (typeof body !== 'object' || body === null) return null;
  const { id, model, colour, nick } = body as Record<string, unknown>;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (!isModel(model) || !isColourId(colour)) return null;
  const clean = typeof nick === 'string' ? nick.trim().slice(0, NICK_MAX_LEN) : '';
  return { id, model, colour, ...(clean ? { nick: clean } : {}) };
};

/** Create a short code that carries an identity from the phone to the car. */
export async function createPairing(request: Request, env: Env): Promise<Response> {
  const payload = readPayload(await request.json().catch(() => null));
  if (!payload) return json({ error: 'bad payload' }, 400);

  const now = Date.now();
  const expiresAt = now + PAIR_TTL_MS;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      await env.DB.prepare(
        'INSERT INTO pairing_codes (code, payload, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
        .bind(code, JSON.stringify(payload), now, expiresAt)
        .run();
      return json({ code, expiresAt });
    } catch {
      // Code already taken, or expired row still present: try another.
    }
  }
  return json({ error: 'could not allocate a code' }, 503);
}

/** Claim a code once. The car adopts the phone's identity. */
export async function claimPairing(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (overClaimLimit(ip, now)) return json({ error: 'too many attempts' }, 429);

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const raw = typeof body?.code === 'string' ? normaliseCode(body.code) : '';
  if (!isValidCode(raw)) return json({ error: 'bad code' }, 400);

  const row = await env.DB.prepare(
    'SELECT payload FROM pairing_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(raw, now)
    .first<{ payload: string }>();
  if (!row) return json({ error: 'unknown or expired code' }, 404);

  const claimed = await env.DB.prepare(
    'UPDATE pairing_codes SET used_at = ? WHERE code = ? AND used_at IS NULL',
  )
    .bind(now, raw)
    .run();
  if (claimed.meta.changes === 0) return json({ error: 'unknown or expired code' }, 404);

  return json({ identity: JSON.parse(row.payload) as PairPayload });
}
