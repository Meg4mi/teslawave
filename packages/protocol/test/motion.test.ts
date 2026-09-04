import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  createTrack,
  destination,
  evaluate,
  haversineM,
  lerpHeading,
  predict,
  pushSample,
  sample,
  RENDER_DELAY_MS,
  MAX_DEAD_RECKON_MS,
  type MotionSample,
} from '../src/motion.js';

describe('geometry', () => {
  it('measures known distances', () => {
    // Geneva -> Lausanne is about 50 km.
    const d = haversineM(46.2044, 6.1432, 46.5197, 6.6323);
    expect(d).toBeGreaterThan(45_000);
    expect(d).toBeLessThan(55_000);
  });

  it('round-trips destination and bearing', () => {
    const start = { lat: 46.2, lng: 6.14 };
    const to = destination(start.lat, start.lng, 42, 1_000);
    expect(haversineM(start.lat, start.lng, to.lat, to.lng)).toBeCloseTo(1_000, 0);
    expect(bearingDeg(start.lat, start.lng, to.lat, to.lng)).toBeCloseTo(42, 1);
  });
});

describe('lerpHeading', () => {
  it('takes the shortest arc across north', () => {
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpHeading(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(lerpHeading(0, 90, 0.5)).toBeCloseTo(45, 6);
    expect(lerpHeading(350, 10, 0)).toBeCloseTo(350, 6);
    expect(lerpHeading(350, 10, 1)).toBeCloseTo(10, 6);
    // 0 -> 180 is exactly ambiguous: either way round is the shortest arc.
    expect([90, 270]).toContain(Math.round(lerpHeading(0, 180, 0.5)));
  });
});

describe('predict', () => {
  it('advances along the heading at the given speed', () => {
    const s: MotionSample = { lat: 46.2, lng: 6.14, heading: 90, speed: 72, ts: 1_000 };
    const p = predict(s, 2_000); // 1 s at 20 m/s
    expect(haversineM(s.lat, s.lng, p.lat, p.lng)).toBeCloseTo(20, 0);
  });

  it('never extrapolates further than MAX_DEAD_RECKON_MS', () => {
    const s: MotionSample = { lat: 46.2, lng: 6.14, heading: 90, speed: 72, ts: 0 };
    const far = predict(s, 60_000);
    const capped = predict(s, MAX_DEAD_RECKON_MS);
    expect(haversineM(far.lat, far.lng, capped.lat, capped.lng)).toBeLessThan(0.5);
  });
});

describe('evaluate', () => {
  it('interpolates between two samples', () => {
    const a: MotionSample = { lat: 46.0, lng: 6.0, heading: 0, speed: 50, ts: 0 };
    const b: MotionSample = { lat: 46.1, lng: 6.0, heading: 0, speed: 50, ts: 2_000 };
    expect(evaluate([a, b], 1_000)?.lat).toBeCloseTo(46.05, 6);
  });

  it('returns null with no samples', () => {
    expect(evaluate([], 0)).toBeNull();
  });
});

describe('EntityTrack', () => {
  const mk = (ts: number, lat: number): MotionSample => ({
    lat,
    lng: 6.14,
    heading: 0,
    speed: 72,
    ts,
  });

  it('never jumps when a new sample arrives at constant speed', () => {
    const track = createTrack();
    let serverNow = 10_000;
    // A car driving north at 20 m/s, sampled every 2 s.
    const step = 20 / 111_320; // ~20 m in degrees of latitude
    let lat = 46.2;
    for (let ts = 6_000; ts <= 10_000; ts += 2_000) {
      pushSample(track, mk(ts, lat), serverNow);
      lat += step * 2;
    }
    let before = sample(track, serverNow)!;
    expect(before).not.toBeNull();

    for (let i = 0; i < 5; i++) {
      serverNow += 2_000;
      // Draw one frame just before the sample arrives.
      before = sample(track, serverNow - 1)!;
      pushSample(track, mk(serverNow, lat), serverNow);
      lat += step * 2;
      const after = sample(track, serverNow)!;
      const jump = haversineM(before.lat, before.lng, after.lat, after.lng);
      expect(jump).toBeLessThan(1);
    }
  });

  it('blends a late correction away instead of snapping', () => {
    const track = createTrack();
    const serverNow = 10_000;
    pushSample(track, mk(6_000, 46.2), serverNow);
    pushSample(track, mk(8_000, 46.2004), serverNow);
    const drawn = sample(track, serverNow)!;
    // A sample that contradicts the dead reckoning by ~100 m.
    pushSample(track, { ...mk(10_000, 46.2013), heading: 0 }, serverNow);
    const justAfter = sample(track, serverNow)!;
    expect(haversineM(drawn.lat, drawn.lng, justAfter.lat, justAfter.lng)).toBeLessThan(1);
    const settled = sample(track, serverNow + 1_100)!;
    const truth = evaluate(track.samples, serverNow + 1_100 - RENDER_DELAY_MS)!;
    expect(haversineM(settled.lat, settled.lng, truth.lat, truth.lng)).toBeLessThan(0.5);
  });

  it('starts moving immediately on the first sample instead of freezing', () => {
    const track = createTrack();
    const now = 10_000;
    pushSample(track, mk(now, 46.2), now);
    const first = sample(track, now)!;
    const later = sample(track, now + 1_000)!;
    // 72 km/h northbound: about 20 m in a second, not a frozen car.
    expect(haversineM(first.lat, first.lng, later.lat, later.lng)).toBeGreaterThan(15);
  });

  it('switches to interpolation once a second sample arrives, without a jump', () => {
    const track = createTrack();
    let now = 10_000;
    pushSample(track, mk(now, 46.2), now);
    const before = sample(track, now + 1_999)!;
    now += 2_000;
    pushSample(track, mk(now, 46.2004), now);
    const after = sample(track, now)!;
    expect(haversineM(before.lat, before.lng, after.lat, after.lng)).toBeLessThan(1);
  });

  it('keeps at most three samples', () => {
    const track = createTrack();
    for (let i = 0; i < 10; i++) pushSample(track, mk(i * 2_000, 46 + i * 0.001), i * 2_000);
    expect(track.samples.length).toBeLessThanOrEqual(3);
  });
});
