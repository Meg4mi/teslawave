import { SELF } from 'cloudflare:test';
import {
  PROTOCOL_VERSION,
  idFromSecret,
  parseServerMsg,
  type ClientMsg,
  type ServerMsg,
} from '@teslawave/protocol';

export type Client = {
  send: (msg: ClientMsg | string) => void;
  next: (match: (m: ServerMsg) => boolean, timeoutMs?: number) => Promise<ServerMsg>;
  received: ServerMsg[];
  closed: Promise<{ code: number; reason: string }>;
  close: () => void;
  /**
   * Every driver this connection has been told about, on either wire.
   *
   * The compact wire refers to a car by a small integer after describing it once (ADR-0033),
   * so a test that looks for an id in `upd` finds nothing. This reads both shapes back into
   * ids, which is what the assertions actually mean.
   */
  carIds: () => string[];
  /** Resolves once this driver is on the connection's map. */
  waitForCar: (id: string, timeoutMs?: number) => Promise<void>;
};

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function connect(hub = 'u0'): Promise<Client> {
  const response = await SELF.fetch(`https://teslawave.test/ws?hub=${hub}`, {
    headers: { Upgrade: 'websocket' },
  });
  const ws = response.webSocket;
  if (!ws) throw new Error(`no websocket: ${response.status} ${await response.text()}`);
  ws.accept();

  const received: ServerMsg[] = [];
  /** handle -> driver id, learned from the meta that introduces each car. */
  const handles = new Map<number, string>();
  const seen = new Set<string>();
  const listeners = new Set<() => void>();
  let closedWith: { code: number; reason: string } | null = null;
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.addEventListener('close', (event) => {
      closedWith = { code: event.code, reason: event.reason };
      resolve(closedWith);
      for (const l of [...listeners]) l();
    });
  });

  ws.addEventListener('message', (event) => {
    const msg = parseServerMsg(typeof event.data === 'string' ? event.data : '');
    if (msg) {
      received.push(msg);
      if (msg.t === 'welcome') {
        // A welcome resets what the handles mean: the hub may have restarted since.
        handles.clear();
        for (const car of msg.snapshot) seen.add(car.id);
      }
      if (msg.t === 'diff') for (const car of msg.upd) seen.add(car.id);
      if (msg.t === 'diff2') {
        for (const m of msg.meta) handles.set(m.h, m.id);
        for (const car of msg.upd) {
          const id = handles.get(car[0]);
          if (id) seen.add(id);
        }
        for (const h of msg.gone) {
          const id = handles.get(h);
          if (id) seen.delete(id);
          handles.delete(h);
        }
      }
    }
    for (const l of [...listeners]) l();
  });

  const client: Client = {
    received,
    closed,
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
    close: () => ws.close(),
    carIds: () => [...seen],
    waitForCar: (id, timeoutMs = 5_000) =>
      new Promise<void>((resolve, reject) => {
        const check = (): boolean => {
          if (!seen.has(id)) return false;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve();
          return true;
        };
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`timed out waiting for ${id}; saw ${[...seen].join(', ') || 'nobody'}`));
        }, timeoutMs);
        const listener = (): void => {
          check();
        };
        listeners.add(listener);
        if (check()) listeners.delete(listener);
      }),
    next: (match, timeoutMs = 5_000) =>
      new Promise<ServerMsg>((resolve, reject) => {
        const check = (): boolean => {
          const found = received.find(match);
          if (found) {
            listeners.delete(check as unknown as () => void);
            clearTimeout(timer);
            resolve(found);
            return true;
          }
          if (closedWith) {
            clearTimeout(timer);
            reject(new Error(`socket closed: ${closedWith.code} ${closedWith.reason}`));
            return true;
          }
          return false;
        };
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`timed out waiting for a message; got ${JSON.stringify(received)}`));
        }, timeoutMs);
        const listener = (): void => {
          check();
        };
        listeners.add(listener);
        if (check()) listeners.delete(listener);
      }),
  };
  return client;
}

/** A test driver is named; the secret it holds and the id the hub gives it both follow. */
export const secretOf = (name: string): string => `secret-${name}-0123456789`;
export const idOf = (name: string): string => idFromSecret(secretOf(name));

export const helloMsg = (
  name: string,
  cells: string[],
  extra: Partial<Extract<ClientMsg, { t: 'hello' }>> = {},
): ClientMsg => ({
  t: 'hello',
  secret: secretOf(name),
  model: '3',
  colour: 'red',
  cells,
  v: PROTOCOL_VERSION,
  ...extra,
});

export const posMsg = (lat: number, lng: number, speed = 50): ClientMsg => ({
  t: 'pos',
  lat,
  lng,
  heading: 90,
  speed,
  ts: Date.now(),
});
