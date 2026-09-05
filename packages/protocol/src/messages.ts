import { CELL_ID_RE, MAX_CELLS_PER_CLIENT, NICK_MAX_LEN } from './constants.js';
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
  | { t: 'wave'; from: CarPublic; ts: number }
  | { t: 'waved'; to: string; ok: boolean; reason?: WaveFailReason }
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
      return {
        t: 'hello',
        secret: value['secret'],
        model: value['model'],
        colour: value['colour'],
        cells,
        ...(nick === undefined ? {} : { nick }),
        ...(value['spectator'] === true ? { spectator: true } : {}),
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
    case 'error': {
      const code = value['code'];
      if (code !== 'cell' && code !== 'cap' && code !== 'rate' && code !== 'bad') return null;
      return { t: 'error', code, ...(typeof value['msg'] === 'string' ? { msg: value['msg'] } : {}) };
    }
    default:
      return null;
  }
}
