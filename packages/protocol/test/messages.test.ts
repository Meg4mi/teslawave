import { describe, expect, it } from 'vitest';
import { parseClientMsg, parseServerMsg } from '../src/messages.js';

const hello = {
  t: 'hello',
  id: 'a-b-c',
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

  it('rejects unknown message types and bad payloads', () => {
    expect(parseServerMsg({ t: 'mystery' })).toBeNull();
    expect(parseServerMsg({ t: 'wave', from: { id: 'x' }, ts: 1 })).toBeNull();
    expect(parseServerMsg({ t: 'error', code: 'boom' })).toBeNull();
    expect(parseServerMsg('not json')).toBeNull();
  });
});
