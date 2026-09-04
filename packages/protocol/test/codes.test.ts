import { describe, expect, it } from 'vitest';
import { generateCode, isValidCode, normaliseCode } from '../src/codes.js';
import { PAIR_ALPHABET, PAIR_CODE_LEN } from '../src/constants.js';

describe('pairing codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toHaveLength(PAIR_CODE_LEN);
      expect(isValidCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('has no ambiguous characters in the alphabet at all', () => {
    expect(PAIR_ALPHABET).not.toMatch(/[01OI]/);
    expect(new Set(PAIR_ALPHABET).size).toBe(PAIR_ALPHABET.length);
  });

  it('normalises what a driver actually types', () => {
    expect(normaliseCode(' ab2-cd3 ')).toBe('AB2CD3');
    expect(normaliseCode('ab2cd3extra')).toBe('AB2CD3');
  });

  it('rejects wrong length and unknown characters', () => {
    expect(isValidCode('AB2CD')).toBe(false);
    expect(isValidCode('AB2CD0')).toBe(false);
    expect(isValidCode('AB2CDI')).toBe(false);
  });
});
