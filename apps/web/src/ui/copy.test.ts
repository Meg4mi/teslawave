import { describe, expect, it } from 'vitest';
import { BRAND } from '@teslawave/protocol';
import { agoLabel, COPY } from './copy';

describe('copy', () => {
  it('speaks like an owner: short, warm, and never shouting', () => {
    const strings = JSON.stringify(COPY);
    expect(strings).not.toContain('!');
    // No emoji in chrome (brief 7).
    expect(strings).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('carries the disclaimer verbatim from the one place it is defined', () => {
    expect(COPY.disclaimer).toBe(BRAND.disclaimer);
    expect(COPY.brand).toBe(BRAND.name);
  });

  it('names a car the way a driver would', () => {
    expect(COPY.wave.prompt('Y', 'deepblue')).toBe('Wave at the blue Model Y');
    expect(COPY.wave.received('3', 'ultrared')).toBe('A red Model 3 waved at you');
  });

  it('keeps the last-wave label glanceable', () => {
    const now = 1_700_000_000_000;
    expect(agoLabel(null, now)).toBeNull();
    expect(agoLabel(now - 5_000, now)).toBe('just now');
    expect(agoLabel(now - 120_000, now)).toBe('2 min ago');
    expect(agoLabel(now - 7_200_000, now)).toBe('2 h ago');
  });

  it('is honest when the road is empty', () => {
    expect(COPY.map.quiet(9)).toContain('9 drivers online');
    expect(COPY.map.quiet(1)).toContain('1 driver online');
    expect(COPY.map.quiet(0)).toContain('Nobody else out here');
  });
});
