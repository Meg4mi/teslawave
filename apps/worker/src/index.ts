import { HUB_ID_RE } from '@teslawave/protocol';
import { withSecurityHeaders } from './headers.js';
import { claimPairing, createPairing } from './pairing.js';
import { recordPerf } from './perf.js';
import { pruneAndAggregate, readStats, rememberHub } from './stats.js';

export { HubDO } from './hub-do.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

/**
 * The hub id is the only thing that decides how many Durable Objects can ever exist.
 * Validating it here caps that number at 32^2 = 1024, which caps the worst-case bill.
 */
function upgrade(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
  if (env.WS_ENABLED === 'false') return new Response('paused', { status: 503 });
  const hub = new URL(request.url).searchParams.get('hub') ?? '';
  if (!HUB_ID_RE.test(hub)) return new Response('bad hub', { status: 400 });
  if (request.headers.get('Upgrade') !== 'websocket')
    return new Response('expected websocket', { status: 426 });

  // So the daily cron knows this hub exists. Off the request's critical path.
  ctx.waitUntil(rememberHub(env, hub, Date.now()));
  const id = env.HUB.idFromName(hub);
  // Pin the launch region's object to Western Europe instead of wherever the first driver is.
  const stub = env.HUB.get(id, { locationHint: 'weur' });
  return reachHub(stub, request);
}

/** How Cloudflare words the error when a free-plan daily limit is spent (ADR-0002). */
const QUOTA_RE = /limit|exceed|quota|1027/i;

/**
 * Past the free tier, a Durable Object request fails with an error rather than a bill. The
 * client needs to hear 429 for that, so it can say "back at midnight" instead of retrying in
 * silence; anything else the hub throws is a 502, which the client treats as a plain drop.
 */
async function reachHub(stub: DurableObjectStub, request: Request): Promise<Response> {
  try {
    return await stub.fetch(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (QUOTA_RE.test(message)) return new Response('over budget', { status: 429 });
    console.error('hub unreachable', message);
    return new Response('hub unavailable', { status: 502 });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The socket answers with a 101 and a WebSocket, which is not a response to rewrite.
    // Everything else goes out through one door, so a new endpoint cannot forget the headers.
    if (url.pathname === '/ws') return upgrade(request, env, ctx);
    return withSecurityHeaders(await route(request, env, url), url);
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await pruneAndAggregate(env, Date.now());
  },
};

/** Every response except the socket upgrade, before the security headers go on. */
async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;

  if (pathname === '/api/whereami') {
    const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
    return json({
      lat: typeof cf?.['latitude'] === 'string' ? Number(cf['latitude']) : null,
      lng: typeof cf?.['longitude'] === 'string' ? Number(cf['longitude']) : null,
      city: typeof cf?.['city'] === 'string' ? cf['city'] : null,
    });
  }

  if (pathname === '/api/pair' && request.method === 'POST') return createPairing(request, env);
  if (pathname === '/api/pair/claim' && request.method === 'POST') return claimPairing(request, env);
  if (pathname === '/api/stats') return readStats(env);
  if (pathname === '/api/perf' && request.method === 'POST') return recordPerf(request, env);
  if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

  // www -> apex, so the domain reads the same everywhere it is shared.
  if (url.hostname.startsWith('www.')) {
    const apex = new URL(url);
    apex.hostname = url.hostname.slice(4);
    return Response.redirect(apex.toString(), 301);
  }

  return env.ASSETS.fetch(request);
}
