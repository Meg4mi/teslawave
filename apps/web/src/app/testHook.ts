import { getSelfPlacement, getSummary, tickWorld } from '../sim/world';
import { frameStats, resetFrameStats } from '../perf/frames';

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
    // `drawn` used to differ from `lat`/`lng` by a display nudge onto roads; cars are drawn
    // exactly where the server put them now (ADR-0024), and the field stays for the tests.
    cars: () =>
      tickWorld(performance.now()).map((car) => ({
        id: car.id,
        lat: car.placement.lat,
        lng: car.placement.lng,
        heading: car.placement.heading,
        distanceM: car.distanceM,
        drawn: { lat: car.placement.lat, lng: car.placement.lng },
      })),
    summary: getSummary,
    self: getSelfPlacement,
    frameCost: frameStats,
    resetFrameCost: resetFrameStats,
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
