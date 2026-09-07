import {
  PAIR_TTL_MS,
  generateCode,
  isColourId,
  isModel,
  isSecret,
  isValidCode,
  normaliseCode,
  NICK_MAX_LEN,
} from '@teslawave/protocol';
import { overLimit } from './limits.js';

/**
 * What crosses from the phone to the car: the secret, not the id. The car derives the same
 * id from it, and from then on both devices are the same driver (ADR-0025). The row that
 * carries it lives ten minutes at most and is deleted the moment it is claimed.
 */
export type PairPayload = { secret: string; model: string; colour: string; nick?: string };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const CLAIM_LIMIT = 10;
const CLAIM_WINDOW_MS = 60_000;
/**
 * Creating a code writes a D1 row, and D1's free tier allows 100k row writes a day for the
 * whole app. Claiming was limited and creating was not, so the cheap half of the pair was the
 * unguarded one: a script could have spent the day's write budget in minutes and taken
 * pairing — and the daily counter harvest, which shares the budget — down with it.
 *
 * A driver makes one code, occasionally two when the first expires unused. Five a minute is
 * generous for a person and useless for a script.
 */
const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60_000;

const readPayload = (body: unknown): PairPayload | null => {
  if (typeof body !== 'object' || body === null) return null;
  const { secret, model, colour, nick } = body as Record<string, unknown>;
  if (!isSecret(secret)) return null;
  if (!isModel(model) || !isColourId(colour)) return null;
  const clean = typeof nick === 'string' ? nick.trim().slice(0, NICK_MAX_LEN) : '';
  return { secret, model, colour, ...(clean ? { nick: clean } : {}) };
};

/** Create a short code that carries an identity from the phone to the car. */
export async function createPairing(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  // Before the body is read, and before anything is written: the limit exists to protect the
  // write budget, so it has to sit in front of the write.
  if (overLimit('pair-create', ip, CREATE_LIMIT, CREATE_WINDOW_MS, now))
    return json({ error: 'too many attempts' }, 429);

  const payload = readPayload(await request.json().catch(() => null));
  if (!payload) return json({ error: 'bad payload' }, 400);

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

/** Claim a code once. The car adopts the phone's identity, and the row is gone. */
export async function claimPairing(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (overLimit('pair', ip, CLAIM_LIMIT, CLAIM_WINDOW_MS, now))
    return json({ error: 'too many attempts' }, 429);

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const raw = typeof body?.code === 'string' ? normaliseCode(body.code) : '';
  if (!isValidCode(raw)) return json({ error: 'bad code' }, 400);

  const row = await env.DB.prepare(
    'SELECT payload FROM pairing_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?',
  )
    .bind(raw, now)
    .first<{ payload: string }>();
  if (!row) return json({ error: 'unknown or expired code' }, 404);

  // Delete rather than mark: the payload carries a secret, and nothing should hold it a
  // moment longer than the hand-over needs. The row count is what makes this single-use.
  const claimed = await env.DB.prepare('DELETE FROM pairing_codes WHERE code = ? AND used_at IS NULL')
    .bind(raw)
    .run();
  if (claimed.meta.changes === 0) return json({ error: 'unknown or expired code' }, 404);

  return json({ identity: JSON.parse(row.payload) as PairPayload });
}
