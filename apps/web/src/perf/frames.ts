/**
 * How long our own per-frame work takes (world tick plus the canvas overlay), excluding the
 * map's internal repaint. This is the part we control, so it is the part the performance
 * test gates on and the part the beacon reports (ADR-0027).
 *
 * A ring of the last 600 frames: ten seconds at 60 fps, twenty at the half rate.
 */
const RING = 600;
const costs: number[] = [];

/** Latched by the render loop; what the beacon says about the fallbacks. */
const render = { halfRate: false, lowRes: false, cars: 0 };

export function recordFrameCost(ms: number): void {
  costs.push(ms);
  if (costs.length > RING) costs.shift();
}

export function noteRender(next: { halfRate: boolean; lowRes: boolean; cars: number }): void {
  render.halfRate = next.halfRate;
  render.lowRes = next.lowRes;
  render.cars = next.cars;
}

export type FrameStats = {
  mean: number;
  p95: number;
  samples: number;
  halfRate: boolean;
  lowRes: boolean;
  cars: number;
};

export function frameStats(): FrameStats {
  if (costs.length === 0) return { mean: 0, p95: 0, samples: 0, ...render };
  const sorted = [...costs].sort((a, b) => a - b);
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    samples: sorted.length,
    ...render,
  };
}

export function resetFrameStats(): void {
  costs.splice(0, costs.length);
}
