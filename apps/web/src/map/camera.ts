/**
 * The follow camera's memory, on its own so the awkward part is a test rather than a hope.
 *
 * The awkward part is this: the camera skips a `jumpTo` when the driver has not moved since
 * the last one, because repainting the whole vector map thirty times a second for a car
 * standing at a light is the most expensive thing on screen. That shortcut is only sound
 * while nothing else moves the map. A pan, a pinch, or the recentre button all move it —
 * and then "the driver has not moved" is no longer a reason to leave the camera alone, it is
 * the reason the map never came back. A parked car, panned away from, stayed panned away
 * from: "Back to my car" cleared the hold and the next frame decided there was nothing to do.
 *
 * So every hold and every release forgets where we last put the camera. The only thing the
 * shortcut is allowed to remember is a centre this camera itself chose.
 */

export type CameraFix = { lat: number; lng: number; bearing: number };

/** How long the camera stays out of the way after the driver touches the map. */
export const CAMERA_HOLD_MS = 6_000;
/** Roughly a tenth of a metre, and a fifth of a degree: below this nothing visibly moves. */
const EPSILON_DEG = 1e-6;
const EPSILON_BEARING = 0.2;

const moved = (last: CameraFix, next: CameraFix): boolean =>
  Math.abs(last.lat - next.lat) > EPSILON_DEG ||
  Math.abs(last.lng - next.lng) > EPSILON_DEG ||
  Math.abs(last.bearing - next.bearing) > EPSILON_BEARING;

export type Camera = {
  /** The driver has the map: stand aside for CAMERA_HOLD_MS. */
  hold: (now: number) => void;
  /** Give it straight back — a tap that was not a gesture, or "Back to my car". */
  release: () => void;
  held: (now: number) => boolean;
  /** Where to jump the map now, or null to leave it exactly where it is. */
  step: (now: number, fix: CameraFix | null, interval: number) => CameraFix | null;
};

export function createCamera(): Camera {
  let heldUntil = 0;
  let steppedAt = 0;
  /** The centre this camera last chose. Null whenever anything else may have moved the map. */
  let last: CameraFix | null = null;

  return {
    hold(now) {
      heldUntil = now + CAMERA_HOLD_MS;
      last = null;
    },
    release() {
      heldUntil = 0;
      // Not just unheld: due now. Waiting out the frame interval on a button press reads as
      // the button having missed.
      steppedAt = 0;
      last = null;
    },
    held: (now) => now < heldUntil,
    step(now, fix, interval) {
      if (!fix || now < heldUntil || now - steppedAt < interval) return null;
      steppedAt = now;
      if (last && !moved(last, fix)) return null;
      last = { ...fix };
      return last;
    },
  };
}
