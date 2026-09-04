import { FUZZ_MAX_M, FUZZ_MIN_M, FUZZ_STEP_M } from './constants.js';

/**
 * Positions are fuzzed on the client, before anything leaves the device (brief 2.3).
 *
 * A bounded random walk, not a fresh random offset per update: a fresh offset would jitter
 * the car by up to 75 m every 5 s and destroy the glide, while a fixed offset would expose
 * the exact shape of the trip. The offset drifts by at most FUZZ_STEP_M per update and stays
 * between FUZZ_MIN_M and FUZZ_MAX_M from the true position. Regenerated on every page load.
 */
export type FuzzState = { x: number; y: number };

export type Random = () => number;

const magnitude = (s: FuzzState): number => Math.hypot(s.x, s.y);

const clampToRing = (s: FuzzState): FuzzState => {
  const m = magnitude(s);
  if (m === 0) return { x: FUZZ_MIN_M, y: 0 };
  const target = Math.min(Math.max(m, FUZZ_MIN_M), FUZZ_MAX_M);
  const k = target / m;
  return { x: s.x * k, y: s.y * k };
};

export function createFuzz(random: Random = Math.random): FuzzState {
  const angle = random() * Math.PI * 2;
  const m = FUZZ_MIN_M + random() * (FUZZ_MAX_M - FUZZ_MIN_M);
  return { x: Math.cos(angle) * m, y: Math.sin(angle) * m };
}

export function stepFuzz(state: FuzzState, random: Random = Math.random): FuzzState {
  const angle = random() * Math.PI * 2;
  const step = random() * FUZZ_STEP_M;
  return clampToRing({ x: state.x + Math.cos(angle) * step, y: state.y + Math.sin(angle) * step });
}

const M_PER_DEG_LAT = 111_320;

/** Apply the offset and round to 5 decimals (~1 m), so no extra precision leaks. */
export function applyFuzz(
  lat: number,
  lng: number,
  state: FuzzState,
): { lat: number; lng: number } {
  const dLat = state.y / M_PER_DEG_LAT;
  const mPerDegLng = M_PER_DEG_LAT * Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = state.x / mPerDegLng;
  return {
    lat: Math.round((lat + dLat) * 1e5) / 1e5,
    lng: Math.round((lng + dLng) * 1e5) / 1e5,
  };
}
