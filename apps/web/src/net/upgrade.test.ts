import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, STATIONARY_SPEED_KMH } from '@teslawave/protocol';
import { shouldReload } from './upgrade';

const NEXT = PROTOCOL_VERSION + 1;

describe('shouldReload', () => {
  it('does nothing until the hub has said anything', () => {
    expect(shouldReload({ wanted: null, reloadedFor: null }, 0)).toBe(false);
  });

  it('reloads a stopped car once the hub wants a newer version', () => {
    expect(shouldReload({ wanted: NEXT, reloadedFor: null }, 0)).toBe(true);
  });

  it('waits while the car is moving', () => {
    expect(shouldReload({ wanted: NEXT, reloadedFor: null }, 90)).toBe(false);
    // Rolling at walking pace is still a drive: a reload here blanks the map mid-junction.
    expect(shouldReload({ wanted: NEXT, reloadedFor: null }, STATIONARY_SPEED_KMH)).toBe(false);
  });

  it('reloads once the car finally stops', () => {
    const state = { wanted: NEXT, reloadedFor: null };
    expect(shouldReload(state, 50)).toBe(false);
    expect(shouldReload(state, STATIONARY_SPEED_KMH - 0.1)).toBe(true);
  });

  it('reloads at most once per version, so a stale edge cannot loop the car', () => {
    // The reload happened, the same old bundle came back, and the hub says the same thing
    // again. Reloading on that would be a loop for the rest of the drive.
    expect(shouldReload({ wanted: NEXT, reloadedFor: NEXT }, 0)).toBe(false);
    // A version beyond the one we already tried is a fresh deploy, and worth one more go.
    expect(shouldReload({ wanted: NEXT + 1, reloadedFor: NEXT }, 0)).toBe(true);
  });

  it('ignores a version that is not newer than ours', () => {
    expect(shouldReload({ wanted: PROTOCOL_VERSION, reloadedFor: null }, 0)).toBe(false);
    expect(shouldReload({ wanted: PROTOCOL_VERSION - 1, reloadedFor: null }, 0)).toBe(false);
  });
});
