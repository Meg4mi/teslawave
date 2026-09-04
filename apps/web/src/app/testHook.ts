import { getSelfPlacement, getSummary, tickWorld } from '../sim/world';

/**
 * How long our own per-frame work takes (world tick plus the canvas overlay), excluding the
 * map's internal repaint. This is the part we control, so this is the part the performance
 * test gates on.
 */
const costs: number[] = [];

export function recordFrameCost(ms: number): void {
  costs.push(ms);
  if (costs.length > 600) costs.shift();
}

const frameCost = (): { mean: number; p95: number; samples: number } => {
  if (costs.length === 0) return { mean: 0, p95: 0, samples: 0 };
  const sorted = [...costs].sort((a, b) => a - b);
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    samples: sorted.length,
  };
};

export type TestHook = {
  cars: () => Array<{
    id: string;
    lat: number;
    lng: number;
    heading: number;
    distanceM: number;
    drawn: { lat: number; lng: number };
  }>;
  summary: () => ReturnType<typeof getSummary>;
  self: () => ReturnType<typeof getSelfPlacement>;
  identity: () => unknown;
  frameCost: () => { mean: number; p95: number; samples: number };
  resetFrameCost: () => void;
};

/**
 * Exposed only in development or with ?e2e. The end-to-end tests assert on real world state
 * (a car actually moving) rather than on pixels, which would be flaky.
 */
export function installTestHook(): void {
  const hook: TestHook = {
    // `lat`/`lng` are what the server sent, so tests of the network and motion pipeline are
    // not disturbed by the display nudge onto roads; `drawn` is where the sprite actually is.
    cars: () =>
      tickWorld(performance.now()).map((car) => ({
        id: car.id,
        lat: car.reported.lat,
        lng: car.reported.lng,
        heading: car.reported.heading,
        distanceM: car.distanceM,
        drawn: { lat: car.placement.lat, lng: car.placement.lng },
      })),
    summary: getSummary,
    self: getSelfPlacement,
    frameCost,
    resetFrameCost: () => costs.splice(0, costs.length),
    identity: () => {
      try {
        return JSON.parse(localStorage.getItem('tw.identity.v1') ?? 'null');
      } catch {
        return null;
      }
    },
  };
  (window as unknown as { __tw: TestHook }).__tw = hook;
}
