import { describe, expect, it } from 'vitest';
import { nextResetLabel } from './budget';

describe('nextResetLabel', () => {
  it('is midnight UTC, in local time, whichever side of daylight saving we are', () => {
    const summer = Date.UTC(2026, 8, 5, 12);
    const winter = Date.UTC(2026, 0, 5, 12);
    expect(nextResetLabel(summer, 'Europe/Zurich')).toBe('02:00');
    expect(nextResetLabel(winter, 'Europe/Zurich')).toBe('01:00');
    expect(nextResetLabel(summer, 'UTC')).toBe('00:00');
    expect(nextResetLabel(summer, 'America/Los_Angeles')).toBe('17:00');
  });

  it('never says 24:00', () => {
    expect(nextResetLabel(Date.UTC(2026, 8, 5, 23, 59), 'UTC')).toBe('00:00');
  });
});
