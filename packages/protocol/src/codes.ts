import { PAIR_ALPHABET, PAIR_CODE_LEN } from './constants.js';

/** A source of numbers in [0, 1): Math.random, or a fixed one in tests. */
export type Random = () => number;

export function generateCode(random: Random = Math.random): string {
  let out = '';
  for (let i = 0; i < PAIR_CODE_LEN; i++) {
    out += PAIR_ALPHABET[Math.floor(random() * PAIR_ALPHABET.length)] ?? PAIR_ALPHABET[0];
  }
  return out;
}

/** Uppercase, spaces and dashes stripped: people read these aloud and type them on a car screen. */
export const normaliseCode = (raw: string): string =>
  raw.toUpperCase().replace(/[\s-]/g, '').slice(0, PAIR_CODE_LEN);

export function isValidCode(raw: string): boolean {
  if (raw.length !== PAIR_CODE_LEN) return false;
  for (const ch of raw) if (!PAIR_ALPHABET.includes(ch)) return false;
  return true;
}
