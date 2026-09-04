import { lerpHeading, predict, type MotionSample, type Placement } from '@teslawave/protocol';

/**
 * Your own car, smoothed.
 *
 * Every other car on the map is interpolated between server samples, so it glides. Your own
 * car was drawn straight from the raw fix — and `watchPosition` delivers about one fix a
 * second. So the map held still for a second and then jumped: at 100 km/h that is a 28 metre
 * step, and in a turn it is the whole turn arriving at once. Which is what "the map is laggy
 * when I turn" is: not slow frames, a camera moving in one-second increments.
 *
 * So the fix is dead-reckoned forward from the last one at frame rate, and the drawn position
 * eases toward that. A new fix does not teleport the camera; it bends it. The cost is about a
 * third of a second of lag behind the truth, against the two full seconds we already accept
 * for everyone else.
 */

/** How quickly the drawn position catches up with the dead-reckoned one. */
const TAU_MS = 320;
/** Heading is noisier than position and a rotating map is more distracting than a sliding one. */
const HEADING_TAU_MS = 420;
/** Past this the last fix is too old to extrapolate from; hold still rather than invent a drive. */
const STALE_MS = 12_000;

export type SelfFollower = {
  /** A new fix from the device. `at` is wall clock, matching the fix's own timestamp. */
  push: (fix: MotionSample | null) => void;
  /** Advance to this frame and return where to draw. `nowMs` is the monotonic frame time. */
  advance: (nowMs: number, wallNow: number) => Placement | null;
  current: () => Placement | null;
};

export function createSelfFollower(): SelfFollower {
  let fix: MotionSample | null = null;
  let current: Placement | null = null;
  let lastFrame = 0;

  return {
    push(next) {
      if (!next) {
        fix = null;
        current = null;
        return;
      }
      fix = next;
      // The first fix, or one after a gap: be where you are, do not slide in from the old spot.
      if (!current) current = { lat: next.lat, lng: next.lng, heading: next.heading, speed: next.speed };
    },

    advance(nowMs, wallNow) {
      const dt = lastFrame === 0 ? 16 : Math.min(250, nowMs - lastFrame);
      lastFrame = nowMs;
      if (!fix) return null;
      if (wallNow - fix.ts > STALE_MS) return current;

      const target = predict(fix, wallNow);
      if (!current) {
        current = target;
        return current;
      }
      const k = 1 - Math.exp(-dt / TAU_MS);
      const kh = 1 - Math.exp(-dt / HEADING_TAU_MS);
      current = {
        lat: current.lat + (target.lat - current.lat) * k,
        lng: current.lng + (target.lng - current.lng) * k,
        heading: lerpHeading(current.heading, target.heading, kh),
        speed: current.speed + (target.speed - current.speed) * k,
      };
      return current;
    },

    current: () => current,
  };
}
