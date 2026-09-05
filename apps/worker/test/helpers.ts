import { SELF } from 'cloudflare:test';
import { idFromSecret, parseServerMsg, type ClientMsg, type ServerMsg } from '@teslawave/protocol';

export type Client = {
  send: (msg: ClientMsg | string) => void;
  next: (match: (m: ServerMsg) => boolean, timeoutMs?: number) => Promise<ServerMsg>;
  received: ServerMsg[];
  closed: Promise<{ code: number; reason: string }>;
  close: () => void;
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
    if (msg) received.push(msg);
    for (const l of [...listeners]) l();
  });

  return {
    received,
    closed,
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
    close: () => ws.close(),
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
}

/** A test driver is named; the secret it holds and the id the hub gives it both follow. */
export const secretOf = (name: string): string => `secret-${name}-0123456789`;
export const idOf = (name: string): string => idFromSecret(secretOf(name));

export const helloMsg = (
  name: string,
  cells: string[],
  extra: Partial<Extract<ClientMsg, { t: 'hello' }>> = {},
): ClientMsg => ({ t: 'hello', secret: secretOf(name), model: '3', colour: 'red', cells, ...extra });

export const posMsg = (lat: number, lng: number, speed = 50): ClientMsg => ({
  t: 'pos',
  lat,
  lng,
  heading: 90,
  speed,
  ts: Date.now(),
});
