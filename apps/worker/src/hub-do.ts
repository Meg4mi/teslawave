import { DurableObject } from 'cloudflare:workers';
import {
  MAX_MSG_BYTES,
  hubOf,
  parseClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';
import {
  createHub,
  flushIfDue,
  harvest,
  hubStats,
  onBadMessage,
  onClose,
  onMessage,
  openSocket,
  restoreSocket,
  type Effect,
  type HubState,
  type SocketProfile,
} from '@teslawave/hub-core';

const HUB_META_KEY = 'meta:hub';
/** Keys per storage list on restore, and per delete on harvest (the API's own maximum). */
const RESTORE_PAGE = 1_000;
const DELETE_BATCH = 128;

/**
 * The only class in the repo, and a thin adapter: all the logic lives in @teslawave/hub-core
 * so it can be tested without workerd and moved off Cloudflare if we ever need to.
 *
 * Cost invariants, enforced by ESLint and by tests. Breaking any of them makes this object
 * ineligible for hibernation, which means it is billed for wall-clock time 24/7 for as long
 * as one driver is connected (see docs/decisions/0002-hub-durable-object-and-cost-model.md):
 *
 *   - sockets are accepted with ctx.acceptWebSocket(), never ws.accept();
 *   - there is no setTimeout, setInterval or alarm here: the tick is driven by arriving messages;
 *   - no fetch() and no D1 from a message handler;
 *   - positions are never written to storage, only wave counters, and only when they change.
 */
export class HubDO extends DurableObject<Env> {
  #state: HubState | null = null;
  #byKey = new Map<string, WebSocket>();
  #ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Ping/pong is answered by the runtime without waking the object: free keepalive.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.#ready = ctx.blockConcurrencyWhile(async () => {
      await this.#restore();
    });
  }

  async #restore(): Promise<void> {
    const now = Date.now();
    const wavesByUser = new Map<string, number>();
    const lastWaveByUser = new Map<string, number>();
    const wavesByCellDay = new Map<string, number>();
    let hub = '';
    // Every key, in pages: a single capped list would one day have quietly dropped the
    // counters past the cap and let the next wave overwrite them from zero.
    let startAfter: string | undefined;
    for (;;) {
      const page = await this.ctx.storage.list<string | number>({
        limit: RESTORE_PAGE,
        ...(startAfter === undefined ? {} : { startAfter }),
      });
      for (const [key, value] of page) {
        if (key === HUB_META_KEY && typeof value === 'string') hub = value;
        if (typeof value !== 'number') continue;
        if (key.startsWith('w:')) wavesByUser.set(key, value);
        else if (key.startsWith('wt:')) lastWaveByUser.set(key, value);
        else if (key.startsWith('c:')) wavesByCellDay.set(key, value);
      }
      if (page.size < RESTORE_PAGE) break;
      startAfter = [...page.keys()].at(-1);
    }

    const sockets = this.ctx.getWebSockets();
    const profiles: SocketProfile[] = [];
    for (const ws of sockets) {
      const profile = ws.deserializeAttachment() as SocketProfile | null;
      if (!profile?.key) continue;
      profiles.push(profile);
      this.#byKey.set(profile.key, ws);
    }
    if (!hub) hub = hubOf(profiles.find((p) => p.cells[0])?.cells[0] ?? '');

    const state = createHub(hub, now, { wavesByUser, lastWaveByUser, wavesByCellDay });
    for (const profile of profiles) restoreSocket(state, profile);
    this.#state = state;
  }

  #hub(): HubState {
    if (!this.#state) throw new Error('hub not initialised');
    return this.#state;
  }

  override async fetch(request: Request): Promise<Response> {
    await this.#ready;
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('expected websocket', { status: 426 });

    const hub = new URL(request.url).searchParams.get('hub') ?? '';
    const state = this.#hub();
    if (!state.hub && hub) {
      state.hub = hub;
      // One row, once in this object's lifetime, so a hibernation wake knows who it is.
      await this.ctx.storage.put(HUB_META_KEY, hub);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const key = crypto.randomUUID();
    // Hibernation API: the object can sleep between messages and stops accruing duration.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ key, id: '', cells: [] });
    this.#byKey.set(key, server);
    openSocket(state, key);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.#ready;
    const state = this.#hub();
    const key = this.#keyOf(ws);
    if (!key) return;

    const now = Date.now();
    const tooBig = typeof message !== 'string' || message.length > MAX_MSG_BYTES;
    const parsed = tooBig ? null : parseClientMsg(message);
    const effects = parsed ? onMessage(state, key, parsed, now) : onBadMessage(state, key);
    effects.push(...flushIfDue(state, now));
    await this.#apply(effects);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.#gone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.#gone(ws);
  }

  async #gone(ws: WebSocket): Promise<void> {
    await this.#ready;
    const state = this.#hub();
    const key = this.#keyOf(ws);
    if (!key) return;
    this.#byKey.delete(key);
    const effects = onClose(state, key);
    effects.push(...flushIfDue(state, Date.now(), true));
    await this.#apply(effects);
  }

  #keyOf(ws: WebSocket): string | null {
    const profile = ws.deserializeAttachment() as { key?: string } | null;
    if (profile?.key) {
      if (!this.#byKey.has(profile.key)) this.#byKey.set(profile.key, ws);
      return profile.key;
    }
    return null;
  }

  async #apply(effects: Effect[]): Promise<void> {
    let writes: Record<string, number> | null = null;
    for (const effect of effects) {
      switch (effect.k) {
        case 'send': {
          this.#send(effect.to, effect.msg);
          break;
        }
        case 'attach': {
          this.#byKey.get(effect.to)?.serializeAttachment(effect.profile);
          break;
        }
        case 'close': {
          const ws = this.#byKey.get(effect.to);
          this.#byKey.delete(effect.to);
          onClose(this.#hub(), effect.to);
          try {
            ws?.close(effect.code, effect.reason);
          } catch {
            // Already gone.
          }
          break;
        }
        case 'persist': {
          writes ??= {};
          for (const [key, value] of effect.entries) writes[key] = value;
          break;
        }
      }
    }
    // Wave counters only, a handful of keys at a time. Never positions.
    if (writes) await this.ctx.storage.put(writes);
  }

  #send(key: string, msg: ServerMsg): void {
    const ws = this.#byKey.get(key);
    if (!ws) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      this.#byKey.delete(key);
      onClose(this.#hub(), key);
    }
  }

  /**
   * Called by the Worker cron once a day, as an RPC request: never from a message handler,
   * never from an alarm. Hands over the finished cell-day counters for D1, drops them and any
   * driver not seen in half a year from storage, and returns nothing that could locate anyone.
   */
  async harvest(now = Date.now()): Promise<Array<{ cell: string; day: string; waves: number }>> {
    await this.#ready;
    const result = harvest(this.#hub(), now);
    for (let i = 0; i < result.deleteKeys.length; i += DELETE_BATCH)
      await this.ctx.storage.delete(result.deleteKeys.slice(i, i + DELETE_BATCH));
    if (result.persist.length > 0) await this.ctx.storage.put(Object.fromEntries(result.persist));
    return result.cellDays;
  }

  /** Test and support helper. Returns counts only: there are no positions to hand out. */
  async debugStats(): Promise<Record<string, unknown>> {
    await this.#ready;
    if (this.env.TEST_MODE !== 'true') return { error: 'disabled' };
    const keys = [...(await this.ctx.storage.list({ limit: 1_000 })).keys()];
    return { ...hubStats(this.#hub()), accepted: this.ctx.getWebSockets().length, storageKeys: keys };
  }
}
