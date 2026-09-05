import { frameStats } from './frames';

/**
 * The only real performance data is from real cars, and CI has no GPU. A driver who turns on
 * "Share performance data" sends a few numbers now and then: screen density and size, how
 * long our frame work takes, whether the fallbacks kicked in, and how many cars were on the
 * map. No position, no id, no nickname, nothing that could tell one driver from another
 * beyond the model of screen they have (ADR-0027).
 */
export type PerfSample = {
  v: 1;
  dpr: number;
  tesla: boolean;
  chromium: number;
  width: number;
  height: number;
  mean: number;
  p95: number;
  samples: number;
  halfRate: boolean;
  lowRes: boolean;
  cars: number;
};

/** The first report, once the map has settled and there is something to say. */
export const FIRST_BEACON_MS = 2 * 60_000;
/** Then now and again: a drive of an hour costs six requests. */
export const BEACON_INTERVAL_MS = 10 * 60_000;
const CHECK_MS = 30_000;
/** Fewer frames than this and the numbers are the boot, not the drive. */
const MIN_SAMPLES = 300;

const chromiumMajor = (ua: string): number => {
  const match = /Chrom(?:e|ium)\/(\d+)/.exec(ua);
  return match ? Number(match[1]) : 0;
};

export function currentSample(): PerfSample {
  const stats = frameStats();
  return {
    v: 1,
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    tesla: /Tesla/i.test(navigator.userAgent),
    chromium: chromiumMajor(navigator.userAgent),
    width: window.innerWidth,
    height: window.innerHeight,
    mean: Math.round(stats.mean * 100) / 100,
    p95: Math.round(stats.p95 * 100) / 100,
    samples: stats.samples,
    halfRate: stats.halfRate,
    lowRes: stats.lowRes,
    cars: stats.cars,
  };
}

const post = (sample: PerfSample): void => {
  void fetch('/api/perf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample),
    keepalive: true,
  }).catch(() => undefined);
};

/** Start reporting. Returns the function that stops it. */
export function startBeacon(now = Date.now): () => void {
  const startedAt = now();
  let lastSentAt = 0;
  const tick = (): void => {
    if (document.visibilityState !== 'visible') return;
    const t = now();
    if (t - startedAt < FIRST_BEACON_MS) return;
    if (lastSentAt !== 0 && t - lastSentAt < BEACON_INTERVAL_MS) return;
    const sample = currentSample();
    if (sample.samples < MIN_SAMPLES) return;
    lastSentAt = t;
    post(sample);
  };
  const timer = window.setInterval(tick, CHECK_MS);
  return () => window.clearInterval(timer);
}
