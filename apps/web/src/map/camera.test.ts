import { describe, expect, it } from 'vitest';
import { CAMERA_HOLD_MS, createCamera } from './camera';

/**
 * The bug these are here for: "Back to my car" did nothing on a car that was not moving.
 * The camera skipped the jump because the driver's position had not changed since the last
 * one it made — never mind that a pan had moved the map out from under it in between.
 */
describe('follow camera', () => {
  const geneva = { lat: 46.2044, lng: 6.1432, bearing: 0 };
  const never = 0;

  it('follows the driver, and does not repaint the map when nothing has moved', () => {
    const camera = createCamera();
    expect(camera.step(0, geneva, never)).toEqual(geneva);
    expect(camera.step(1, geneva, never)).toBeNull();
    expect(camera.step(2, { ...geneva, lat: 46.3 }, never)).toEqual({ ...geneva, lat: 46.3 });
  });

  it('stands aside while the driver has the map, and comes back on its own', () => {
    const camera = createCamera();
    camera.step(0, geneva, never);
    camera.hold(1_000);
    expect(camera.held(1_500)).toBe(true);
    expect(camera.step(1_500, geneva, never)).toBeNull();
    // The hold runs out and the parked car has not moved a millimetre: come back anyway.
    expect(camera.held(1_000 + CAMERA_HOLD_MS + 1)).toBe(false);
    expect(camera.step(1_000 + CAMERA_HOLD_MS + 1, geneva, never)).toEqual(geneva);
  });

  it('recentres a car that has not moved, which is what the button is usually pressed for', () => {
    const camera = createCamera();
    camera.step(0, geneva, never);
    // Panned away, then "Back to my car": the position is stale, the map is not.
    camera.hold(1_000);
    camera.release();
    expect(camera.step(1_100, geneva, never)).toEqual(geneva);
  });

  it('does not make the button wait out a frame interval', () => {
    const camera = createCamera();
    camera.step(10_000, geneva, 33);
    camera.hold(10_000);
    camera.release();
    // One millisecond later, well inside the interval that throttles the follow loop.
    expect(camera.step(10_001, geneva, 33)).toEqual(geneva);
  });

  it('throttles the follow loop to the interval it is given', () => {
    const camera = createCamera();
    expect(camera.step(1_000, { ...geneva, lat: 46.1 }, 33)).not.toBeNull();
    expect(camera.step(1_020, { ...geneva, lat: 46.2 }, 33)).toBeNull();
    expect(camera.step(1_040, { ...geneva, lat: 46.3 }, 33)).not.toBeNull();
  });

  it('has nothing to do without a position', () => {
    const camera = createCamera();
    expect(camera.step(0, null, never)).toBeNull();
  });
});
