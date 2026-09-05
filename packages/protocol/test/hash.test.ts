import { describe, expect, it } from 'vitest';
import { ID_LEN, idFromSecret, isSecret, sha256Hex } from '../src/hash.js';

/** The platform's own SHA-256, reached without the DOM or Node typings this package lacks. */
type Platform = {
  crypto: { subtle: { digest: (name: string, data: Uint8Array) => Promise<ArrayBuffer> } };
  TextEncoder: new () => { encode: (s: string) => Uint8Array };
};
const platform = globalThis as unknown as Platform;

const reference = async (input: string): Promise<string> => {
  const digest = await platform.crypto.subtle.digest('SHA-256', new platform.TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

describe('sha256Hex', () => {
  it('matches the known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('agrees with the platform implementation across block boundaries', async () => {
    // Lengths either side of the 55/56/64 byte padding edges, plus a long one and non-ASCII.
    const inputs = [
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(63),
      'a'.repeat(64),
      'a'.repeat(65),
      'x'.repeat(1_000),
      'teslawave-id:3f2b7c1e-9d4a-4b6f-8e2a-5c7d9a1b3e4f',
      'héllo wörld ✓',
      'astral 𝄞 clef',
    ];
    for (const input of inputs) expect(sha256Hex(input), input.slice(0, 20)).toBe(await reference(input));
  });
});

describe('idFromSecret', () => {
  it('is stable, short, and not the secret', () => {
    const secret = '3f2b7c1e-9d4a-4b6f-8e2a-5c7d9a1b3e4f';
    const id = idFromSecret(secret);
    expect(id).toHaveLength(ID_LEN);
    expect(id).toMatch(/^[0-9a-f]+$/);
    expect(id).toBe(idFromSecret(secret));
    expect(id).not.toContain(secret.slice(0, 8));
    expect(idFromSecret(`${secret}x`)).not.toBe(id);
  });

  it('accepts a UUID-shaped secret and refuses short or odd ones', () => {
    expect(isSecret('3f2b7c1e-9d4a-4b6f-8e2a-5c7d9a1b3e4f')).toBe(true);
    expect(isSecret('short')).toBe(false);
    expect(isSecret('has spaces in it and more')).toBe(false);
    expect(isSecret('x'.repeat(129))).toBe(false);
    expect(isSecret(42)).toBe(false);
  });
});
