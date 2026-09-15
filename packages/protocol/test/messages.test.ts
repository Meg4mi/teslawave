import { describe, expect, it } from 'vitest';
import { parseClientMsg, parseServerMsg } from '../src/messages.js';

const hello = {
  t: 'hello',
  secret: '3f2b7c1e-9d4a-4b6f-8e2a-5c7d9a1b3e4f',
  model: '3',
  colour: 'red',
  nick: 'Nico',
  cells: ['u0gz'],
};

describe('parseClientMsg', () => {
  it('accepts a well-formed hello, from a string or an object', () => {
    expect(parseClientMsg(hello)?.t).toBe('hello');
    expect(parseClientMsg(JSON.stringify(hello))?.t).toBe('hello');
  });

  it('rejects a hello that carries an id instead of a secret, or a short secret', () => {
    const withoutSecret: Record<string, unknown> = { ...hello, id: 'car-a' };
    delete withoutSecret['secret'];
    expect(parseClientMsg(withoutSecret)).toBeNull();
    expect(parseClientMsg({ ...hello, secret: 'short' })).toBeNull();
  });

  it('rejects unknown models, colours and cells', () => {
    expect(parseClientMsg({ ...hello, model: 'Roadster' })).toBeNull();
    expect(parseClientMsg({ ...hello, colour: 'chartreuse' })).toBeNull();
    expect(parseClientMsg({ ...hello, cells: ['u0g!'] })).toBeNull();
    expect(parseClientMsg({ ...hello, cells: [] })).toBeNull();
    expect(parseClientMsg({ ...hello, cells: ['a', 'b', 'c', 'd', 'e'] })).toBeNull();
  });

  it('trims and caps the nickname', () => {
    const msg = parseClientMsg({ ...hello, nick: '   a very long nickname indeed   ' });
    expect(msg?.t === 'hello' && msg.nick).toBe('a very long nick');
  });

  it('accepts a valid pos and rejects impossible ones', () => {
    const pos = { t: 'pos', lat: 46.2, lng: 6.1, heading: 90, speed: 50, ts: 1 };
    expect(parseClientMsg(pos)?.t).toBe('pos');
    expect(parseClientMsg({ ...pos, lat: 91 })).toBeNull();
    expect(parseClientMsg({ ...pos, lng: 181 })).toBeNull();
    expect(parseClientMsg({ ...pos, heading: 360 })).toBeNull();
    expect(parseClientMsg({ ...pos, speed: -1 })).toBeNull();
    expect(parseClientMsg({ ...pos, lat: Number.NaN })).toBeNull();
    expect(parseClientMsg({ ...pos, lat: 'nope' })).toBeNull();
  });

  it('never throws on garbage', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      '',
      'not json',
      '[]',
      '{"t":',
      42,
      [],
      { t: 'nope' },
      { t: 'wave' },
      { t: 'wave', to: '../../etc/passwd' },
      { t: 'hello' },
    ];
    for (const g of garbage) expect(parseClientMsg(g)).toBeNull();
  });
});

describe('parseServerMsg', () => {
  const car = {
    id: 'x',
    model: 'Y',
    colour: 'deepblue',
    waves: 3,
    since: 1,
    lat: 46.2,
    lng: 6.1,
    heading: 90,
    speed: 50,
    ts: 10,
    cell: 'u0gz',
  };

  it('parses a diff and drops malformed entries instead of failing', () => {
    const msg = parseServerMsg({
      t: 'diff',
      cell: 'u0gz',
      upd: [car, { ...car, lat: 999 }, 'junk'],
      gone: ['y', 42],
      online: 2,
      wavesToday: 7,
      lastWaveTs: 5,
    });
    expect(msg?.t).toBe('diff');
    if (msg?.t === 'diff') {
      expect(msg.upd).toHaveLength(1);
      expect(msg.gone).toEqual(['y']);
    }
  });

  it('normalises heading and speed coming from the wire', () => {
    const msg = parseServerMsg({ t: 'diff', cell: 'u0gz', upd: [{ ...car, heading: -90 }], gone: [] });
    if (msg?.t === 'diff') expect(msg.upd[0]?.heading).toBe(270);
  });

  it('reads every refusal a wave can get, and drops one it does not know', () => {
    for (const reason of ['range', 'offline', 'rate', 'hidden', 'nofix'])
      expect(parseServerMsg({ t: 'waved', to: 'x', ok: false, reason })).toEqual({
        t: 'waved',
        to: 'x',
        ok: false,
        reason,
      });
    expect(parseServerMsg({ t: 'waved', to: 'x', ok: false, reason: 'later' })).toEqual({
      t: 'waved',
      to: 'x',
      ok: false,
    });
  });

  it('reads the hub asking where we are', () => {
    expect(parseServerMsg('{"t":"where"}')).toEqual({ t: 'where' });
  });

  it('rejects unknown message types and bad payloads', () => {
    expect(parseServerMsg({ t: 'mystery' })).toBeNull();
    expect(parseServerMsg({ t: 'wave', from: { id: 'x' }, ts: 1 })).toBeNull();
    expect(parseServerMsg({ t: 'error', code: 'boom' })).toBeNull();
    expect(parseServerMsg('not json')).toBeNull();
  });
});

describe('status and reports on the wire', () => {
  const hello = {
    t: 'hello',
    secret: '3f2b7c1e-9d4a-4b6f-8e2a-5c7d9a1b3e4f',
    model: '3',
    colour: 'red',
    cells: ['u0gz'],
    v: 2,
  };

  it('carries a known status and drops one it does not know', () => {
    const known = parseClientMsg({ ...hello, status: 'roadtrip' });
    expect(known?.t === 'hello' && known.status).toBe('roadtrip');
    const unknown = parseClientMsg({ ...hello, status: 'racing' });
    expect(unknown?.t === 'hello' && 'status' in unknown).toBe(false);
  });

  it('reads a report with a position, and nothing else', () => {
    const msg = parseClientMsg({ t: 'report', kind: 'police', at: [4620440, 614320] });
    expect(msg).toEqual({ t: 'report', kind: 'police', at: [4620440, 614320] });
    expect(parseClientMsg({ t: 'report', kind: 'camera', at: [4620440, 614320] })).toBeNull();
    expect(parseClientMsg({ t: 'report', kind: 'police' })).toBeNull();
    expect(parseClientMsg({ t: 'report', kind: 'police', at: [9_100_000, 0] })).toBeNull();
  });

  it('reads reports from the hub and drops a malformed one', () => {
    const good = { id: 'u0-abc-1', kind: 'accident', lat: 46.2, lng: 6.1, at: 5, n: 2 };
    const msg = parseServerMsg({
      t: 'reports',
      cell: 'u0hq',
      upd: [good, { ...good, id: 'x', kind: 'camera' }, { ...good, id: 'y', n: 0 }],
      gone: ['u0-old', 7],
    });
    expect(msg).toEqual({ t: 'reports', cell: 'u0hq', upd: [good], gone: ['u0-old'] });
  });

  it('reads every answer a report can get, and drops a reason it does not know', () => {
    expect(parseServerMsg({ t: 'reported', ok: true })).toEqual({ t: 'reported', ok: true });
    for (const reason of ['rate', 'hidden', 'range'])
      expect(parseServerMsg({ t: 'reported', ok: false, reason })).toEqual({
        t: 'reported',
        ok: false,
        reason,
      });
    expect(parseServerMsg({ t: 'reported', ok: false, reason: 'weather' })).toEqual({
      t: 'reported',
      ok: false,
    });
  });

  it('keeps a status on a car state, a meta and a public car', () => {
    const car = { id: 'x', model: 'Y', colour: 'deepblue', waves: 3, since: 1, status: 'charging' };
    const wave = parseServerMsg({ t: 'wave', from: car, ts: 1 });
    expect(wave?.t === 'wave' && wave.from.status).toBe('charging');
    const meta = { h: 1, id: 'x', model: 'Y', colour: 'deepblue', since: 1, cell: 'u0hq', status: 'nope' };
    const diff2 = parseServerMsg({ t: 'diff2', cell: 'u0hq', now: 1, meta: [meta], upd: [], gone: [] });
    expect(diff2?.t === 'diff2' && 'status' in (diff2.meta[0] ?? {})).toBe(false);
  });
});
