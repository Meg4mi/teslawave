import { applyFuzz, createFuzz, stepFuzz, type FuzzState } from '@teslawave/protocol';
import type { Fix } from './usePosition';

/**
 * The true position never leaves this module. Everything sent to the server goes through
 * here first, and the offset is regenerated on every page load (ADR-0004).
 */
let state: FuzzState = createFuzz();

export function resetFuzz(): void {
  state = createFuzz();
}

export function fuzzed(fix: Fix): { lat: number; lng: number; heading: number; speed: number } {
  state = stepFuzz(state);
  const { lat, lng } = applyFuzz(fix.lat, fix.lng, state);
  return { lat, lng, heading: fix.heading, speed: fix.speed };
}
