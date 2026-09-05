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
  MAX_TURN_RATE_DEG_S,
  turnRate,
  type MotionSample,
} from '../src/motion.js';

/**
 * A car going round a bend: a circle of radius `r` metres, clockwise, at `speedKmh`. The
 * sample at `seconds` is where the car is then, with the heading it actually has there.
 */
const bend = (r: number, speedKmh: number) => {
  const centre = { lat: 46.2, lng: 6.14 };
  const degPerSecond = ((speedKmh / 3.6 / r) * 180) / Math.PI;
  return (seconds: number): MotionSample => {
    const spoke = degPerSecond * seconds;
    const at = destination(centre.lat, centre.lng, spoke, r);
    return { lat: at.lat, lng: at.lng, heading: (spoke + 90) % 360, speed: speedKmh, ts: seconds * 1_000 };
  };
};

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

describe('following the bend (ADR-0028)', () => {
  // A 150 m bend at 90 km/h, sampled every 5 s: 48 degrees of arc between samples.
  const on = bend(150, 90);

  it('draws the car on the arc between two samples, not on the chord across it', () => {
    const a = on(0);
    const b = on(5);
    const truth = on(2.5);
    const drawn = evaluate([a, b], 2_500)!;
    expect(haversineM(drawn.lat, drawn.lng, truth.lat, truth.lng)).toBeLessThan(3);
    expect(Math.abs(lerpHeading(drawn.heading, truth.heading, 0) - truth.heading)).toBeLessThan(3);
    // What the straight line would have done: a car's length into the verge.
    const chord = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    expect(haversineM(chord.lat, chord.lng, truth.lat, truth.lng)).toBeGreaterThan(10);
  });

  it('keeps turning past the last sample, at the rate the last two samples showed', () => {
    const samples = [on(0), on(5)];
    const truth = on(8);
    const drawn = evaluate(samples, 8_000)!;
    expect(haversineM(drawn.lat, drawn.lng, truth.lat, truth.lng)).toBeLessThan(4);
    // Straight on along the last heading would have left the road.
    const straight = predict(on(5), 8_000);
    expect(haversineM(straight.lat, straight.lng, truth.lat, truth.lng)).toBeGreaterThan(15);
  });

  it('is still a straight line when the headings say so', () => {
    const a: MotionSample = { lat: 46.0, lng: 6.0, heading: 0, speed: 72, ts: 0 };
    const b = { ...a, lat: a.lat + 100 / 111_320, ts: 5_000 };
    const mid = evaluate([a, b], 2_500)!;
    expect(mid.lat).toBeCloseTo((a.lat + b.lat) / 2, 8);
    expect(mid.lng).toBeCloseTo(a.lng, 8);
    expect(mid.heading).toBeCloseTo(0, 3);
  });

  it('never bends the curve into a loop when the speed contradicts the distance', () => {
    // Reported at 120 km/h but only 10 m apart: a tangent that long would loop.
    const a: MotionSample = { lat: 46.0, lng: 6.0, heading: 0, speed: 120, ts: 0 };
    const b: MotionSample = { ...a, lat: a.lat + 10 / 111_320, heading: 180, ts: 5_000 };
    for (let t = 0; t <= 5_000; t += 250) {
      const p = evaluate([a, b], t)!;
      expect(haversineM(a.lat, a.lng, p.lat, p.lng)).toBeLessThan(25);
    }
  });

  it('clamps the turn rate to a road, and the predicted turn to a bend', () => {
    const a: MotionSample = { lat: 46.0, lng: 6.0, heading: 0, speed: 50, ts: 0 };
    expect(turnRate(a, { ...a, heading: 170, ts: 1_000 })).toBe(MAX_TURN_RATE_DEG_S);
    expect(turnRate(a, { ...a, heading: 350, ts: 1_000 })).toBe(-10);
    const far = predict(a, MAX_DEAD_RECKON_MS, MAX_TURN_RATE_DEG_S);
    expect(far.heading).toBeCloseTo(90, 6);
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

describe('pushSample after a gap', () => {
  const mk = (ts: number, lat: number): MotionSample => ({ lat, lng: 6.14, heading: 0, speed: 72, ts });

  it('places the car rather than sliding it from where it was drawn before the tab slept', () => {
    const track = createTrack();
    pushSample(track, mk(6_000, 46.2), 10_000);
    pushSample(track, mk(8_000, 46.2004), 10_000);
    sample(track, 10_000);
    // Two minutes with no frames: the phone was in a pocket. Then the next sample arrives.
    const later = 130_000;
    pushSample(track, mk(later - 4_000, 46.22), later);
    pushSample(track, mk(later - 2_000, 46.2204), later);
    expect(track.correction).toBeNull();
    const drawn = sample(track, later)!;
    const truth = evaluate(track.samples, later - RENDER_DELAY_MS)!;
    expect(haversineM(drawn.lat, drawn.lng, truth.lat, truth.lng)).toBeLessThan(0.5);
  });

  it('still blends a correction when frames have been running', () => {
    const track = createTrack();
    pushSample(track, mk(6_000, 46.2), 10_000);
    pushSample(track, mk(8_000, 46.2004), 10_000);
    // Drawn a second past the last sample: dead-reckoned 20 m up the road.
    const drawn = sample(track, 11_000)!;
    // Then the car turns out to have stopped where it was: a 20 m contradiction.
    pushSample(track, mk(10_000, 46.2004), 11_000);
    expect(track.correction).not.toBeNull();
    const justAfter = sample(track, 11_000)!;
    expect(haversineM(drawn.lat, drawn.lng, justAfter.lat, justAfter.lng)).toBeLessThan(1);
    const settled = sample(track, 12_100)!;
    const truth = evaluate(track.samples, 12_100 - RENDER_DELAY_MS)!;
    expect(haversineM(settled.lat, settled.lng, truth.lat, truth.lng)).toBeLessThan(0.5);
  });
});
