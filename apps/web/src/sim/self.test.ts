import { beforeEach, describe, expect, it } from 'vitest';
import { haversineM, type MotionSample } from '@teslawave/protocol';
import { createSelfFollower, type SelfFollower } from './self';

const GENEVA = { lat: 46.2044, lng: 6.1432 };
const fix = (over: Partial<MotionSample> = {}): MotionSample => ({
  ...GENEVA,
  heading: 90,
  speed: 100,
  ts: 0,
  ...over,
});

describe('self follower', () => {
  let follower: SelfFollower;
  beforeEach(() => {
    follower = createSelfFollower();
  });

  it('has nothing to draw before the first fix', () => {
    expect(follower.advance(0, 0)).toBeNull();
  });

  it('is exactly where the first fix says, with no slide in from nowhere', () => {
    follower.push(fix());
    const at = follower.advance(0, 0);
    expect(at?.lat).toBe(GENEVA.lat);
    expect(at?.lng).toBe(GENEVA.lng);
  });

  it('keeps moving between fixes instead of waiting for the next one', () => {
    follower.push(fix());
    follower.advance(0, 0);
    // A second of frames with no new fix at all: at 100 km/h that is 28 metres of road.
    let last = follower.advance(16, 16);
    if (!last) throw new Error('no placement');
    let steps = 0;
    for (let t = 32; t <= 1_000; t += 16) {
      const now = follower.advance(t, t);
      if (!now) throw new Error('no placement');
      // Every single frame moves, and none of them jumps.
      const step = haversineM(last.lat, last.lng, now.lat, now.lng);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(2);
      last = now;
      steps++;
    }
    expect(steps).toBeGreaterThan(50);
    expect(haversineM(GENEVA.lat, GENEVA.lng, last.lat, last.lng)).toBeGreaterThan(15);
  });

  it('bends toward a new fix rather than teleporting to it', () => {
    follower.push(fix());
    for (let t = 0; t <= 1_000; t += 16) follower.advance(t, t);
    const before = follower.current();

    // A fix 40 m off where we had dead-reckoned to: a correction, not a jump.
    follower.push(fix({ lat: GENEVA.lat + 0.00036, lng: GENEVA.lng + 0.0004, ts: 1_000 }));
    const after = follower.advance(1_016, 1_016);
    if (!before || !after) throw new Error('no placement');
    expect(haversineM(before.lat, before.lng, after.lat, after.lng)).toBeLessThan(4);
  });

  it('turns through the arc instead of snapping to the new heading', () => {
    follower.push(fix({ heading: 0 }));
    follower.advance(0, 0);
    // A junction: the device reports a 60 degree change all at once.
    follower.push(fix({ heading: 60, ts: 100 }));
    const headings: number[] = [];
    for (let t = 116; t <= 2_000; t += 16) {
      const at = follower.advance(t, t);
      if (at) headings.push(at.heading);
    }
    const first = headings[0] ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(6);
    // Monotonic all the way round, and within a couple of seconds it is there.
    for (let i = 1; i < headings.length; i++)
      expect(headings[i]).toBeGreaterThanOrEqual((headings[i - 1] ?? 0) - 0.001);
    expect(headings.at(-1)).toBeGreaterThan(59);
  });

  it('takes the short way round past north', () => {
    follower.push(fix({ heading: 350 }));
    follower.advance(0, 0);
    follower.push(fix({ heading: 10, ts: 100 }));
    const at = follower.advance(116, 116);
    // Through 0, not the long way round through 180.
    expect(at?.heading).toBeGreaterThan(349);
  });

  it('stops extrapolating once the fix is too old to trust', () => {
    follower.push(fix());
    for (let t = 0; t <= 2_000; t += 16) follower.advance(t, t);
    const parked = follower.current();
    const late = follower.advance(60_000, 60_000);
    expect(late?.lat).toBe(parked?.lat);
    expect(late?.lng).toBe(parked?.lng);
  });

  it('forgets everything when position goes away', () => {
    follower.push(fix());
    follower.advance(0, 0);
    follower.push(null);
    expect(follower.advance(16, 16)).toBeNull();
    expect(follower.current()).toBeNull();
  });
});
