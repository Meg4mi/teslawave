#!/usr/bin/env tsx
/**
 * What one broadcast tick costs, on both wires, at a range of densities.
 *
 * The numbers in ADR-0033 come from here, and the caps in `protocol/constants.ts` are set
 * from them rather than guessed. Re-run it after touching `flushIfDue`:
 *
 *   pnpm bench
 *
 * The fixture is the worst realistic case and the one the decision is about: every driver in
 * one cell, all within interest range of each other, all reporting on the same tick. That is
 * a city centre at rush hour, not a motorway.
 *
 * Serialising is inside the measurement, because the Durable Object does it once per socket
 * (`HubDO#send`). Leaving it out flatters the old wire, whose whole trick was building one
 * big message and handing the same object to everybody — the megabytes only become real when
 * they are turned into text.
 *
 * A caveat worth keeping: this is a laptop or a CI container, not the Cloudflare runtime, and
 * it says nothing at all about the car at the other end. The per-socket byte counts are the
 * numbers that matter for an Intel Atom, and those are exact.
 */
import {
  CELL_PRECISION,
  COMPACT_WIRE_VERSION,
  INTEREST_RADIUS_M,
  MAX_REPORTS_PER_CELL,
  MAX_REPORTS_PER_HUB,
  MAX_SOCKETS_PER_CELL,
  PROTOCOL_VERSION,
  SERVER_TICK_MS,
  WIRE_COORD_SCALE,
  decodeBounds,
  destination,
  encode,
  hubOf,
} from '@teslawave/protocol';
import {
  createHub,
  flushIfDue,
  hubStats,
  onClose,
  onMessage,
  openSocket,
  type Effect,
} from '@teslawave/hub-core';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const CELL = encode(GENEVA.lat, GENEVA.lng, CELL_PRECISION);
const HUB = hubOf(CELL);
/** The wire before ADR-0033: whole car states, every car in the cell, every tick. */
const WHOLE_WIRE_VERSION = 1;

const START = 1_700_000_000_000;
/** Spread over a spiral inside the interest radius, so everyone can see everyone. */
const placeOf = (i: number): { lat: number; lng: number } =>
  destination(GENEVA.lat, GENEVA.lng, (i * 137.5) % 360, 200 + (i % 90) * 130);

function drive(n: number, v: number): { ms: number; total: number; worst: number } {
  let now = START;
  const hub = createHub(HUB, now);
  for (let i = 0; i < n; i++) {
    openSocket(hub, `k${i}`);
    const at = placeOf(i);
    onMessage(
      hub,
      `k${i}`,
      {
        t: 'hello',
        secret: `secret-bench-${i}-0123456789`,
        model: '3',
        colour: 'red',
        cells: [CELL],
        v,
      },
      now,
    );
    onMessage(hub, `k${i}`, { t: 'pos', lat: at.lat, lng: at.lng, heading: 90, speed: 50, ts: now }, now);
  }

  // One warm tick, so every connection already knows about every car and the measured tick
  // is the steady state rather than the first one.
  now += SERVER_TICK_MS;
  flushIfDue(hub, now);

  now += SERVER_TICK_MS;
  for (let i = 0; i < n; i++) {
    const at = destination(placeOf(i).lat, placeOf(i).lng, 90, 30);
    onMessage(hub, `k${i}`, { t: 'pos', lat: at.lat, lng: at.lng, heading: 90, speed: 50, ts: now }, now);
  }

  const started = performance.now();
  const effects: Effect[] = flushIfDue(hub, now);
  let total = 0;
  const perSocket = new Map<string, number>();
  for (const effect of effects) {
    if (effect.k !== 'send') continue;
    const size = JSON.stringify(effect.msg).length;
    total += size;
    perSocket.set(effect.to, (perSocket.get(effect.to) ?? 0) + size);
  }
  return { ms: performance.now() - started, total, worst: Math.max(0, ...perSocket.values()) };
}

/**
 * What a hub full of report pins costs, which is a different question from the one above:
 * pins do not move, so they are not in the tick's fan-out — but they live for hours
 * (ADR-0040, amended), so a hub accumulates them, and the thing to prove is that a tick where
 * none of them changed costs nothing and that the caps actually hold.
 *
 * Every pin here is placed through the real message path, so the caps are exercised rather
 * than assumed: one report per connection per minute is the rate limit, so filling the hub
 * takes one connection per pin.
 */
function pins(wanted: number): { held: number; idleMs: number } {
  let now = START;
  const hub = createHub(HUB, now);
  /*
   * A grid inside the hub's own box, MAX_REPORTS_PER_CELL to a cell: a row of cells walked
   * east from one corner runs out of hub long before the cap is reached, which is how the
   * first version of this fixture quietly measured a fifth of what it claimed. Within a cell
   * the pins sit 400 m apart, which is over the 300 m at which two reports of the same kind
   * merge into one.
   */
  const box = decodeBounds(HUB);
  const keys: string[] = [];
  for (let i = 0; i < wanted; i++) {
    const cellIndex = Math.floor(i / MAX_REPORTS_PER_CELL);
    const east = destination(box.minLat + 0.1, box.minLng + 0.1, 90, (cellIndex % 20) * 30_000);
    const base = destination(east.lat, east.lng, 0, Math.floor(cellIndex / 20) * 20_000);
    const slot = i % MAX_REPORTS_PER_CELL;
    const across = destination(base.lat, base.lng, 90, (slot % 7) * 400);
    const at = destination(across.lat, across.lng, 0, Math.floor(slot / 7) * 400);
    const cell = encode(at.lat, at.lng, CELL_PRECISION);
    if (hubOf(cell) !== HUB) continue;
    const key = `p${i}`;
    keys.push(key);
    openSocket(hub, key);
    onMessage(
      hub,
      key,
      { t: 'hello', secret: `secret-pin-${i}-0123456789`, model: '3', colour: 'red', cells: [cell], v: PROTOCOL_VERSION },
      now,
    );
    onMessage(hub, key, { t: 'pos', lat: at.lat, lng: at.lng, heading: 90, speed: 50, ts: now }, now);
    onMessage(
      hub,
      key,
      {
        t: 'report',
        kind: 'police',
        at: [Math.round(at.lat * WIRE_COORD_SCALE), Math.round(at.lng * WIRE_COORD_SCALE)],
      },
      now,
    );
    now += 1;
  }
  /*
   * Every connection but two goes away, so what is measured is the pins rather than the
   * presence sweep of the thousands of drivers it took to place them. A region carrying old
   * pins and a couple of cars passing through is the shape this is about.
   */
  for (const key of keys.slice(2)) onClose(hub, key, now);
  now += SERVER_TICK_MS;
  flushIfDue(hub, now);

  // Ticks where nothing at all changed: no pin lapsed, no car moved, nobody voted.
  const TICKS = 200;
  const started = performance.now();
  for (let i = 0; i < TICKS; i++) {
    now += SERVER_TICK_MS;
    flushIfDue(hub, now);
  }
  return { held: hubStats(hub).reports, idleMs: (performance.now() - started) / TICKS };
}

console.log(
  `One tick, every driver in one cell within ${INTEREST_RADIUS_M / 1000} km of every other.\n` +
    `Serialising included, as the Durable Object pays it. Cap is ${MAX_SOCKETS_PER_CELL} per cell.\n`,
);
console.log('drivers  wire    tick        total       per socket');
for (const n of [50, 200, 500, 1_000, 2_000]) {
  for (const [label, v] of [
    ['whole', WHOLE_WIRE_VERSION],
    ['compact', COMPACT_WIRE_VERSION],
  ] as const) {
    const { ms, total, worst } = drive(n, v);
    console.log(
      `${String(n).padStart(7)}  ${label.padEnd(7)} ${ms.toFixed(1).padStart(7)} ms  ` +
        `${(total / 1024 / 1024).toFixed(2).padStart(7)} MB  ${(worst / 1024).toFixed(1).padStart(7)} kB`,
    );
  }
}

console.log(
  `\nReport pins placed through the real message path. Caps are ${MAX_REPORTS_PER_CELL} per cell\n` +
    `and ${MAX_REPORTS_PER_HUB} per hub; the tick measured is one where nothing changed.\n`,
);
console.log('offered     held   idle tick');
for (const wanted of [50, 500, 2_000, 4_000]) {
  const { held, idleMs } = pins(wanted);
  console.log(
    `${String(wanted).padStart(7)}  ${String(held).padStart(7)}  ${idleMs.toFixed(3).padStart(7)} ms`,
  );
}
