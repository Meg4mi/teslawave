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
  MAX_SOCKETS_PER_CELL,
  SERVER_TICK_MS,
  destination,
  encode,
  hubOf,
} from '@teslawave/protocol';
import { createHub, flushIfDue, onMessage, openSocket, type Effect } from '@teslawave/hub-core';

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
