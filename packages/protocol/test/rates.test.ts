import { describe, expect, it } from 'vitest';
import { shouldSendPos, type SentPos } from '../src/rates.js';

const prev: SentPos = { heading: 90, speed: 50, sentAt: 0 };
const parked: SentPos = { heading: 90, speed: 0, sentAt: 0 };

describe('shouldSendPos', () => {
  it.each([
    ['first fix always sends', null, { heading: 0, speed: 0 }, 0, true],
    ['below the hard rate limit never sends', prev, { heading: 200, speed: 200 }, 1_900, false],
    ['heading change > 20 deg sends', prev, { heading: 120, speed: 50 }, 2_500, true],
    ['heading change < 20 deg waits', prev, { heading: 100, speed: 50 }, 2_500, false],
    ['speed change > 15 km/h sends', prev, { heading: 90, speed: 70 }, 2_500, true],
    ['moving: waits for 5 s', prev, { heading: 90, speed: 50 }, 4_900, false],
    ['moving: sends at 5 s', prev, { heading: 90, speed: 50 }, 5_000, true],
    ['stationary: waits for 30 s', parked, { heading: 90, speed: 0 }, 6_000, false],
    ['stationary: sends at 30 s', parked, { heading: 90, speed: 0 }, 30_000, true],
    ['pulling away sends immediately', parked, { heading: 90, speed: 20 }, 2_100, true],
  ])('%s', (_name, previous, next, now, expected) => {
    expect(shouldSendPos(previous as SentPos | null, next, now)).toBe(expected);
  });

  it('wraps heading across north', () => {
    expect(shouldSendPos({ heading: 350, speed: 50, sentAt: 0 }, { heading: 5, speed: 50 }, 3_000)).toBe(
      false,
    );
    expect(shouldSendPos({ heading: 350, speed: 50, sentAt: 0 }, { heading: 30, speed: 50 }, 3_000)).toBe(
      true,
    );
  });

  it('keeps a moving driver under 13 messages per minute', () => {
    let sent = 0;
    let last: SentPos | null = null;
    for (let now = 0; now <= 60_000; now += 1_000) {
      const next = { heading: 90, speed: 60 };
      if (shouldSendPos(last, next, now)) {
        sent++;
        last = { ...next, sentAt: now };
      }
    }
    expect(sent).toBeLessThanOrEqual(13);
  });
});
