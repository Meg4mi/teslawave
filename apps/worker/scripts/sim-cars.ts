#!/usr/bin/env tsx
/**
 * Simulated drivers, so the map is never empty during development and the perf test has
 * something to render. Uses the real protocol: same send policy, same fuzzing, same rates.
 *
 *   pnpm sim -- --n 20 --center 46.2044,6.1432 --radius 5000
 */
import {
  CELL_PRECISION,
  CAR_COLOURS,
  NEIGHBOUR_RADIUS_M,
  TESLA_MODELS,
  WAVE_PROMPT_RANGE_M,
  applyFuzz,
  cellsWithin,
  createFuzz,
  destination,
  groupByHub,
  haversineM,
  shouldSendPos,
  stepFuzz,
  type CarColourId,
  type ClientMsg,
  type FuzzState,
  type SentPos,
  type ServerMsg,
  type TeslaModel,
} from '@teslawave/protocol';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const count = Number(arg('n', '20'));
const [centreLat, centreLng] = arg('center', '46.2044,6.1432').split(',').map(Number);
const radius = Number(arg('radius', '5000'));
const base = arg('url', 'ws://127.0.0.1:8787/ws');
const waveChance = Number(arg('waves', '0.01'));

if (!Number.isFinite(centreLat) || !Number.isFinite(centreLng)) {
  console.error('--center expects lat,lng');
  process.exit(1);
}

const NICKS = [
  'Romy', 'Blitz', 'Kev', 'Nova', 'Tino', 'Sasha', 'Perle', 'Ludo', 'Mika', 'Zed',
  'Ava', 'Ren', 'Iggy', 'Mo', 'Juno', 'Otis', 'Wren', 'Cleo', 'Nils', 'Suki',
];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;

type Driver = {
  id: string;
  model: TeslaModel;
  colour: CarColourId;
  nick: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  fuzz: FuzzState;
  lastSent: SentPos | null;
  ws: WebSocket | null;
  cells: string[];
  seen: Map<string, { lat: number; lng: number }>;
  lastWaveAt: number;
};

const drivers: Driver[] = Array.from({ length: count }, (_, i) => {
  const bearing = Math.random() * 360;
  const start = destination(centreLat!, centreLng!, bearing, Math.random() * radius);
  return {
    id: `sim-${i}-${Math.random().toString(36).slice(2, 8)}`,
    model: pick(TESLA_MODELS),
    colour: pick(CAR_COLOURS).id,
    nick: NICKS[i % NICKS.length] ?? `Sim ${i}`,
    lat: start.lat,
    lng: start.lng,
    heading: Math.random() * 360,
    speed: 30 + Math.random() * 60,
    fuzz: createFuzz(),
    lastSent: null,
    ws: null,
    cells: [],
    seen: new Map(),
    lastWaveAt: 0,
  };
});

const send = (driver: Driver, msg: ClientMsg): void => {
  if (driver.ws?.readyState === WebSocket.OPEN) driver.ws.send(JSON.stringify(msg));
};

function connect(driver: Driver): void {
  const cells = cellsWithin(driver.lat, driver.lng, NEIGHBOUR_RADIUS_M, CELL_PRECISION);
  const hub = [...groupByHub(cells).keys()][0];
  if (!hub) return;
  driver.cells = cells;

  const ws = new WebSocket(`${base}?hub=${hub}`);
  driver.ws = ws;

  ws.addEventListener('open', () => {
    send(driver, {
      t: 'hello',
      id: driver.id,
      model: driver.model,
      colour: driver.colour,
      nick: driver.nick,
      cells,
    });
  });

  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data === 'pong') return;
    const msg = JSON.parse(event.data) as ServerMsg;
    if (msg.t === 'diff') for (const car of msg.upd) driver.seen.set(car.id, { lat: car.lat, lng: car.lng });
    if (msg.t === 'welcome') for (const car of msg.snapshot) driver.seen.set(car.id, { lat: car.lat, lng: car.lng });
    if (msg.t === 'wave') console.log(`${driver.nick} was waved at by ${msg.from.nick ?? msg.from.id}`);
  });

  ws.addEventListener('close', () => {
    driver.ws = null;
    setTimeout(() => connect(driver), 1_000 + Math.random() * 2_000);
  });

  ws.addEventListener('error', () => undefined);
}

for (const driver of drivers) connect(driver);

/** One second of driving: gentle heading changes, turn back when too far from the centre. */
setInterval(() => {
  const now = Date.now();
  for (const driver of drivers) {
    const drift = (Math.random() - 0.5) * 12;
    driver.heading = (driver.heading + drift + 360) % 360;
    if (haversineM(driver.lat, driver.lng, centreLat!, centreLng!) > radius) {
      const back = Math.atan2(centreLng! - driver.lng, centreLat! - driver.lat) * (180 / Math.PI);
      driver.heading = (back + 360) % 360;
    }
    const next = destination(driver.lat, driver.lng, driver.heading, driver.speed / 3.6);
    driver.lat = next.lat;
    driver.lng = next.lng;

    driver.fuzz = stepFuzz(driver.fuzz);
    const reported = applyFuzz(driver.lat, driver.lng, driver.fuzz);

    if (shouldSendPos(driver.lastSent, driver, now)) {
      driver.lastSent = { heading: driver.heading, speed: driver.speed, sentAt: now };
      send(driver, { t: 'pos', ...reported, heading: driver.heading, speed: driver.speed, ts: now });
    }

    const cells = cellsWithin(reported.lat, reported.lng, NEIGHBOUR_RADIUS_M, CELL_PRECISION);
    if (cells.join() !== driver.cells.join()) {
      driver.cells = cells;
      send(driver, { t: 'sub', cells });
    }

    if (Math.random() < waveChance && now - driver.lastWaveAt > 10_000) {
      for (const [id, car] of driver.seen) {
        if (haversineM(reported.lat, reported.lng, car.lat, car.lng) < WAVE_PROMPT_RANGE_M) {
          driver.lastWaveAt = now;
          send(driver, { t: 'wave', to: id });
          break;
        }
      }
    }
  }
}, 1_000);

console.log(`${count} simulated drivers around ${centreLat}, ${centreLng} (${base})`);
process.on('SIGINT', () => {
  for (const driver of drivers) driver.ws?.close();
  process.exit(0);
});
