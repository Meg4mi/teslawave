import {
  CELL_ID_RE,
  LEGACY_PROTOCOL_VERSION,
  MAX_CELLS_PER_CLIENT,
  NICK_MAX_LEN,
  WIRE_COORD_SCALE,
} from './constants.js';
import { isSecret } from './hash.js';
import { isColourId, isModel, type CarColourId, type TeslaModel } from './models.js';

export type CarPublic = {
  id: string;
  model: TeslaModel;
  colour: string;
  nick?: string;
  waves: number;
  /** server timestamp of the first hello for this id */
  since: number;
};

export type CarState = CarPublic & {
  lat: number;
  lng: number;
  heading: number;
  /** km/h */
  speed: number;
  ts: number;
  cell: string;
};

/**
 * The facts about a car that do not change while it drives, sent once per connection when the
 * car comes into range and again only if the driver edits their car (ADR-0033).
 *
 * `h` is a handle: a small integer standing in for the 32-character id on every subsequent
 * update. The id itself is 34 bytes of the 210 a full CarState costs, repeated every two
 * seconds for every car on every screen, to say something that never changes.
 *
 * Handles are per hub and per connection. They are not an identity: they are reassigned
 * freely, they mean nothing to another hub, and a driver's real id is still the hash of the
 * secret only their browser holds (ADR-0025).
 */
export type CarMeta = {
  h: number;
  id: string;
  model: TeslaModel;
  colour: string;
  nick?: string;
  since: number;
  cell: string;
};

/**
 * One car's motion, positionally: `[handle, lat, lng, heading, speed, waves, age]`.
 *
 * Coordinates are integers at WIRE_COORD_SCALE and `age` is milliseconds before the diff's
 * own `now`, so the client reconstructs the sample timestamp without another absolute number.
 * Keys are what make JSON expensive at this rate; there are none here.
 */
export type CarWire = readonly [
  h: number,
  lat: number,
  lng: number,
  heading: number,
  speed: number,
  waves: number,
  age: number,
];

export type ClientMsg =
  | {
      t: 'hello';
      /**
       * The driver's secret, never their id: the hub derives the public id by hashing it, so
       * an id read off the wire cannot be used to become that driver (ADR-0025).
       */
      secret: string;
      model: TeslaModel;
      colour: CarColourId;
      nick?: string;
      cells: string[];
      spectator?: boolean;
      /**
       * The wire format this client was built against. Absent means a build from before
       * ADR-0029, which the guard reads as LEGACY_PROTOCOL_VERSION rather than rejecting:
       * a car pinned to an old tab has to keep working long enough to be told to reload.
       */
      v: number;
      /**
       * Where the driver is, at WIRE_COORD_SCALE, so the hub can answer the very first tick
       * with the cars near them rather than with everything in a 39 x 20 km cell (ADR-0033).
       *
       * Sent only by a visible client that already has a fix. It is not a position report:
       * it never enters presence and is never broadcast — only `pos` does that — so an
       * invisible driver or a spectator simply omits it and is served their whole cell, as
       * they were before.
       */
      at?: readonly [lat: number, lng: number];
    }
  | { t: 'pos'; lat: number; lng: number; heading: number; speed: number; ts: number }
  | { t: 'sub'; cells: string[] }
  | { t: 'hide' }
  | { t: 'show' }
  | { t: 'wave'; to: string };

export type WaveFailReason = 'range' | 'offline' | 'rate' | 'hidden';

export type ServerMsg =
  | { t: 'welcome'; now: number; you: CarPublic | null; cells: string[]; snapshot: CarState[] }
  | {
      t: 'diff';
      cell: string;
      upd: CarState[];
      gone: string[];
      online: number;
      wavesToday: number;
      lastWaveTs: number | null;
    }
  /**
   * The same news as `diff`, for a client that speaks the compact wire (ADR-0033). Both are
   * sent, per subscriber, by the same flush: a client that has not reloaded yet still gets
   * `diff` and keeps working, which is the whole promise ADR-0029 made.
   */
  | {
      t: 'diff2';
      cell: string;
      /** The flush time, which every tuple's `age` is measured back from. */
      now: number;
      /** Cars newly in range, or whose driver edited them. */
      meta: CarMeta[];
      upd: CarWire[];
      /** Handles that have left this subscriber's range or the map entirely. */
      gone: number[];
      online: number;
      wavesToday: number;
      lastWaveTs: number | null;
    }
  | { t: 'wave'; from: CarPublic; ts: number }
  | { t: 'waved'; to: string; ok: boolean; reason?: WaveFailReason }
  /**
   * This client is older than the hub. Not a close and not an error: the driver keeps the
   * map, and the client reloads itself the next time the car is standing still (ADR-0029).
   */
  | { t: 'upgrade'; v: number }
  | { t: 'error'; code: 'cell' | 'cap' | 'rate' | 'bad'; msg?: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[\w-]+$/.test(v);

const isCell = (v: unknown): v is string => typeof v === 'string' && CELL_ID_RE.test(v);

function parseCells(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_CELLS_PER_CLIENT) return null;
  const out: string[] = [];
  for (const c of v) {
    if (!isCell(c)) return null;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** A `[lat, lng]` pair at WIRE_COORD_SCALE, or null if it is not one. */
function parseWireAt(v: unknown): readonly [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [lat, lng] = v as [unknown, unknown];
  if (!isFiniteNum(lat) || !isFiniteNum(lng)) return null;
  if (Math.abs(lat) > 90 * WIRE_COORD_SCALE || Math.abs(lng) > 180 * WIRE_COORD_SCALE)
    return null;
  return [Math.round(lat), Math.round(lng)];
}

const cleanNick = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const nick = v.trim().replace(/\s+/g, ' ').slice(0, NICK_MAX_LEN);
  return nick.length > 0 ? nick : undefined;
};

/**
 * Every inbound message is untrusted. The guard never throws and never returns a partial
 * object: anything malformed is a `null`, which the hub turns into a protocol violation.
 */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isObj(value)) return null;

  switch (value['t']) {
    case 'hello': {
      const cells = parseCells(value['cells']);
      if (
        !cells ||
        !isSecret(value['secret']) ||
        !isModel(value['model']) ||
        !isColourId(value['colour'])
      )
        return null;
      const nick = cleanNick(value['nick']);
      // A missing or nonsense version is a client from before ADR-0029, not a bad message:
      // it gets told to upgrade rather than closed on.
      const v = value['v'];
      const at = parseWireAt(value['at']);
      return {
        t: 'hello',
        secret: value['secret'],
        model: value['model'],
        colour: value['colour'],
        cells,
        v: isFiniteNum(v) && v >= 0 && v < 1_000 ? Math.floor(v) : LEGACY_PROTOCOL_VERSION,
        ...(nick === undefined ? {} : { nick }),
        ...(value['spectator'] === true ? { spectator: true } : {}),
        ...(at === null ? {} : { at }),
      };
    }
    case 'pos': {
      const { lat, lng, heading, speed, ts } = value as Record<string, unknown>;
      if (!isFiniteNum(lat) || lat < -90 || lat > 90) return null;
      if (!isFiniteNum(lng) || lng < -180 || lng > 180) return null;
      if (!isFiniteNum(heading) || heading < 0 || heading >= 360) return null;
      if (!isFiniteNum(speed) || speed < 0 || speed > 1000) return null;
      if (!isFiniteNum(ts) || ts < 0) return null;
      return { t: 'pos', lat, lng, heading, speed, ts };
    }
    case 'sub': {
      const cells = parseCells(value['cells']);
      return cells ? { t: 'sub', cells } : null;
    }
    case 'hide':
      return { t: 'hide' };
    case 'show':
      return { t: 'show' };
    case 'wave':
      return isId(value['to']) ? { t: 'wave', to: value['to'] } : null;
    default:
      return null;
  }
}

const parseCarState = (v: unknown): CarState | null => {
  if (!isObj(v)) return null;
  const { id, model, colour, waves, since, lat, lng, heading, speed, ts, cell } = v;
  if (!isId(id) || !isModel(model) || typeof colour !== 'string') return null;
  if (!isFiniteNum(waves) || !isFiniteNum(since) || !isFiniteNum(ts)) return null;
  if (!isFiniteNum(lat) || lat < -90 || lat > 90) return null;
  if (!isFiniteNum(lng) || lng < -180 || lng > 180) return null;
  if (!isFiniteNum(heading) || !isFiniteNum(speed)) return null;
  if (!isCell(cell)) return null;
  const nick = cleanNick(v['nick']);
  return {
    id,
    model,
    colour,
    waves,
    since,
    lat,
    lng,
    heading: ((heading % 360) + 360) % 360,
    speed: Math.max(0, speed),
    ts,
    cell,
    ...(nick === undefined ? {} : { nick }),
  };
};

const parseCarMeta = (v: unknown): CarMeta | null => {
  if (!isObj(v)) return null;
  const { h, id, model, colour, since, cell } = v;
  if (!isFiniteNum(h) || !isId(id) || !isModel(model) || typeof colour !== 'string') return null;
  if (!isFiniteNum(since) || !isCell(cell)) return null;
  const nick = cleanNick(v['nick']);
  return { h, id, model, colour, since, cell, ...(nick === undefined ? {} : { nick }) };
};

/** A fixed-length tuple of finite numbers, or nothing. Length is the whole schema here. */
const parseCarWire = (v: unknown): CarWire | null => {
  if (!Array.isArray(v) || v.length !== 7) return null;
  for (const n of v) if (!isFiniteNum(n)) return null;
  const [h, lat, lng, heading, speed, waves, age] = v as number[];
  if (h === undefined || lat === undefined || lng === undefined) return null;
  if (heading === undefined || speed === undefined || waves === undefined || age === undefined)
    return null;
  if (Math.abs(lat) > 90 * WIRE_COORD_SCALE || Math.abs(lng) > 180 * WIRE_COORD_SCALE) return null;
  return [h, lat, lng, ((heading % 360) + 360) % 360, Math.max(0, speed), waves, Math.max(0, age)];
};

/** Undo the quantisation: back to degrees, and to a server timestamp. */
export const wireToSample = (
  car: CarWire,
  now: number,
): { lat: number; lng: number; heading: number; speed: number; ts: number } => ({
  lat: car[1] / WIRE_COORD_SCALE,
  lng: car[2] / WIRE_COORD_SCALE,
  heading: car[3],
  speed: car[4],
  ts: now - car[6],
});

const parseCarPublic = (v: unknown): CarPublic | null => {
  if (!isObj(v)) return null;
  const { id, model, colour, waves, since } = v;
  if (!isId(id) || !isModel(model) || typeof colour !== 'string') return null;
  if (!isFiniteNum(waves) || !isFiniteNum(since)) return null;
  const nick = cleanNick(v['nick']);
  return { id, model, colour, waves, since, ...(nick === undefined ? {} : { nick }) };
};

/** Server messages are parsed too: a corrupt frame must never poison the world state. */
export function parseServerMsg(raw: unknown): ServerMsg | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isObj(value)) return null;

  switch (value['t']) {
    case 'welcome': {
      const cells = parseCells(value['cells']) ?? [];
      if (!isFiniteNum(value['now'])) return null;
      const snapshot = Array.isArray(value['snapshot'])
        ? value['snapshot'].map(parseCarState).filter((c): c is CarState => c !== null)
        : [];
      return {
        t: 'welcome',
        now: value['now'],
        you: parseCarPublic(value['you']),
        cells,
        snapshot,
      };
    }
    case 'diff': {
      if (!isCell(value['cell'])) return null;
      const upd = Array.isArray(value['upd'])
        ? value['upd'].map(parseCarState).filter((c): c is CarState => c !== null)
        : [];
      const gone = Array.isArray(value['gone']) ? value['gone'].filter(isId) : [];
      return {
        t: 'diff',
        cell: value['cell'],
        upd,
        gone,
        online: isFiniteNum(value['online']) ? value['online'] : 0,
        wavesToday: isFiniteNum(value['wavesToday']) ? value['wavesToday'] : 0,
        lastWaveTs: isFiniteNum(value['lastWaveTs']) ? value['lastWaveTs'] : null,
      };
    }
    case 'diff2': {
      if (!isCell(value['cell']) || !isFiniteNum(value['now'])) return null;
      const meta = Array.isArray(value['meta'])
        ? value['meta'].map(parseCarMeta).filter((m): m is CarMeta => m !== null)
        : [];
      const upd = Array.isArray(value['upd'])
        ? value['upd'].map(parseCarWire).filter((c): c is CarWire => c !== null)
        : [];
      const gone = Array.isArray(value['gone'])
        ? value['gone'].filter((h): h is number => isFiniteNum(h))
        : [];
      return {
        t: 'diff2',
        cell: value['cell'],
        now: value['now'],
        meta,
        upd,
        gone,
        online: isFiniteNum(value['online']) ? value['online'] : 0,
        wavesToday: isFiniteNum(value['wavesToday']) ? value['wavesToday'] : 0,
        lastWaveTs: isFiniteNum(value['lastWaveTs']) ? value['lastWaveTs'] : null,
      };
    }
    case 'wave': {
      const from = parseCarPublic(value['from']);
      if (!from || !isFiniteNum(value['ts'])) return null;
      return { t: 'wave', from, ts: value['ts'] };
    }
    case 'waved': {
      if (!isId(value['to']) || typeof value['ok'] !== 'boolean') return null;
      const reason = value['reason'];
      const valid = reason === 'range' || reason === 'offline' || reason === 'rate' || reason === 'hidden';
      return { t: 'waved', to: value['to'], ok: value['ok'], ...(valid ? { reason } : {}) };
    }
    case 'upgrade': {
      const v = value['v'];
      return isFiniteNum(v) && v >= 0 ? { t: 'upgrade', v: Math.floor(v) } : null;
    }
    case 'error': {
      const code = value['code'];
      if (code !== 'cell' && code !== 'cap' && code !== 'rate' && code !== 'bad') return null;
      return { t: 'error', code, ...(typeof value['msg'] === 'string' ? { msg: value['msg'] } : {}) };
    }
    default:
      return null;
  }
}
