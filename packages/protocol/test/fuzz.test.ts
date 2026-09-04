import { describe, expect, it } from 'vitest';
import { applyFuzz, createFuzz, stepFuzz } from '../src/fuzz.js';
import { FUZZ_MAX_M, FUZZ_MIN_M, FUZZ_STEP_M } from '../src/constants.js';
import { haversineM } from '../src/motion.js';

const mag = (s: { x: number; y: number }): number => Math.hypot(s.x, s.y);

describe('fuzz', () => {
  it('starts between FUZZ_MIN_M and FUZZ_MAX_M', () => {
    for (let i = 0; i < 200; i++) {
      const m = mag(createFuzz());
      expect(m).toBeGreaterThanOrEqual(FUZZ_MIN_M - 1e-9);
      expect(m).toBeLessThanOrEqual(FUZZ_MAX_M + 1e-9);
    }
  });

  it('stays in the ring and never drifts more than FUZZ_STEP_M per update', () => {
    let s = createFuzz();
    for (let i = 0; i < 1_000; i++) {
      const next = stepFuzz(s);
      expect(Math.hypot(next.x - s.x, next.y - s.y)).toBeLessThanOrEqual(FUZZ_STEP_M + 1e-9);
      const m = mag(next);
      expect(m).toBeGreaterThanOrEqual(FUZZ_MIN_M - 1e-9);
      expect(m).toBeLessThanOrEqual(FUZZ_MAX_M + 1e-9);
      s = next;
    }
  });

  it('displaces the reported position by the offset magnitude', () => {
    const lat = 46.2044;
    const lng = 6.1432;
    for (let i = 0; i < 100; i++) {
      const s = createFuzz();
      const out = applyFuzz(lat, lng, s);
      const d = haversineM(lat, lng, out.lat, out.lng);
      expect(d).toBeGreaterThan(FUZZ_MIN_M - 5);
      expect(d).toBeLessThan(FUZZ_MAX_M + 5);
    }
  });

  it('rounds to 5 decimals so no extra precision leaks', () => {
    const out = applyFuzz(46.20443219, 6.14321987, { x: 60, y: 60 });
    expect(out.lat.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
    expect(out.lng.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('moves smoothly: consecutive fuzzed positions of a still car stay close', () => {
    let s = createFuzz();
    let prev = applyFuzz(46.2044, 6.1432, s);
    for (let i = 0; i < 50; i++) {
      s = stepFuzz(s);
      const next = applyFuzz(46.2044, 6.1432, s);
      expect(haversineM(prev.lat, prev.lng, next.lat, next.lng)).toBeLessThan(FUZZ_STEP_M + 2);
      prev = next;
    }
  });
});
