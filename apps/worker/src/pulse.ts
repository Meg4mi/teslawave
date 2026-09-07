import {
  CELL_PRECISION,
  NEIGHBOUR_RADIUS_M,
  cellsWithin,
  groupByHub,
} from '@teslawave/protocol';
import { overLimit } from './limits.js';

/**
 * How many drivers are out there, for someone who has not joined yet.
 *
 * An empty map is the thing most likely to kill this product, and the first screen a driver
 * sees is a car configurator over a map with nothing on it. The app already knows the answer
 * — every connected client is shown "N online" — but only after tapping Go, which is exactly
 * the decision the number would inform (ADR-0032).
 *
 * Counts only. No positions, no ids, nothing that could locate anyone: the same numbers the
 * HUD shows, answered one step earlier.
 *
 * ## The cost, which is the whole design
 *
 * This reaches a Durable Object, and Durable Object requests are the binding free-tier
 * constraint — about 60,000 of the 100,000/day budget at launch volume (ADR-0002). A landing
 * page that spends one of them per visitor is a page that takes the app down on the day it
 * gets shared widely, which is the day it must not.
 *
 * So the answer is cached per cell, not per visitor: every driver in the same map cell shares
 * one lookup. That turns "one request per page load" into "one request per populated cell per
 * minute", which is a number that does not move when the page goes viral. A region with nobody
 * in it is held ten times longer again, because that is most regions most of the time and the
 * lookup that answers "nobody" is the expensive one (see EMPTY_TTL_MS).
 *
 * The isolate memo is the part that always works. The Cache-Control header only starts
 * collapsing requests at the edge once the custom domain is live: the Cache API does nothing
 * on a workers.dev subdomain, which is where this runs today.
 */

const TTL_MS = 60_000;
/**
 * A quiet region is held far longer than a busy one.
 *
 * Asking costs a Durable Object request, and asking a *hibernated* hub costs more than that:
 * the object is reconstructed and its counters are read back from storage in pages, all to
 * answer "nobody is here". Most regions are empty most of the time, and an empty region does
 * not become busy between one minute and the next — the first driver to arrive opens a socket,
 * which wakes the hub anyway.
 *
 * So a zero is cached for ten minutes and a real count for one. That removes both the request
 * and the cold wake for the common case, and costs a landing page at most ten minutes of
 * staleness on a number it only shows when it is above zero.
 */
const EMPTY_TTL_MS = 600_000;
/** Ten a minute per address: a page load makes one, and a reload is not an attack. */
const PULSE_LIMIT = 30;
const PULSE_WINDOW_MS = 60_000;
/** A bound on the memo, so a crawler walking the globe cannot grow it without limit. */
const MAX_MEMO = 512;

export type Pulse = { online: number; wavesToday: number };

type Entry = { at: number; value: Pulse };

const memo = new Map<string, Entry>();

const json = (body: unknown, status = 200, maxAge = 0): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
    },
  });

const readCoord = (raw: string | null, limit: number): number | null => {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
};

/**
 * Ask each hub for the cells it owns, and add the numbers up. One request per hub, which is
 * one in almost every case: a driver's cells are neighbours, and neighbours share a hub
 * except at a precision-2 boundary.
 */
async function fetchPulse(env: Env, cells: string[], now: number): Promise<Pulse> {
  let online = 0;
  let wavesToday = 0;
  for (const [hub, hubCells] of groupByHub(cells)) {
    try {
      const stub = env.HUB.get(env.HUB.idFromName(hub), { locationHint: 'weur' });
      for (const row of await stub.counts(hubCells, now)) {
        online += row.online;
        wavesToday += row.wavesToday;
      }
    } catch {
      // A hub having a bad day, or the day's budget spent. A landing page that says nothing
      // is better than one that says it is broken: the map behind it still works.
    }
  }
  return { online, wavesToday };
}

export async function readPulse(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (overLimit('pulse', ip, PULSE_LIMIT, PULSE_WINDOW_MS, now))
    return json({ error: 'too many' }, 429);

  const url = new URL(request.url);
  const lat = readCoord(url.searchParams.get('lat'), 90);
  const lng = readCoord(url.searchParams.get('lng'), 180);
  if (lat === null || lng === null) return json({ error: 'bad position' }, 400);

  // The same cells the client would subscribe to, so the number means the same thing before
  // and after tapping Go.
  const cells = cellsWithin(lat, lng, NEIGHBOUR_RADIUS_M, CELL_PRECISION);
  const key = cells.join(',');

  const ttlOf = (pulse: Pulse): number => (pulse.online > 0 ? TTL_MS : EMPTY_TTL_MS);

  const cached = memo.get(key);
  if (cached) {
    const ttl = ttlOf(cached.value);
    const age = now - cached.at;
    if (age < ttl) return json(cached.value, 200, Math.round((ttl - age) / 1000));
  }

  const value = await fetchPulse(env, cells, now);
  if (memo.size >= MAX_MEMO) memo.clear();
  memo.set(key, { at: now, value });
  return json(value, 200, ttlOf(value) / 1000);
}
