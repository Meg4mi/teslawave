import { applyFuzz, createFuzz, stepFuzz, type FuzzState, type Random } from '@teslawave/protocol';
import type { Fix } from './usePosition';

/**
 * The true position never leaves this module. Everything sent to the server goes through
 * here first, and the offset is regenerated on every page load (ADR-0004).
 */

/**
 * End-to-end tests need a deterministic offset. Two independently fuzzed cars can be up to
 * 200 m apart no matter how close they really are, which would make any assertion about the
 * wave prompt a coin flip. With `?e2e` every client takes the same offset, so the fuzzing
 * code still runs and relative distances are preserved exactly.
 */
const fixedRandom: Random = () => 0.5;

const randomFor = (): Random => {
  try {
    return new URLSearchParams(location.search).has('e2e') ? fixedRandom : Math.random;
  } catch {
    return Math.random;
  }
};

let random: Random = randomFor();
let state: FuzzState = createFuzz(random);

export function resetFuzz(): void {
  random = randomFor();
  state = createFuzz(random);
}

export function fuzzed(fix: Fix): { lat: number; lng: number; heading: number; speed: number } {
  state = stepFuzz(state, random);
  const { lat, lng } = applyFuzz(fix.lat, fix.lng, state);
  return { lat, lng, heading: fix.heading, speed: fix.speed };
}
