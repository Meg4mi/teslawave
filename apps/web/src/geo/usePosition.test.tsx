import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePosition, type GeoStatus } from './usePosition';

/**
 * A phone that answers neither way.
 *
 * The reported bug: on mobile the HUD said "Reconnecting…" for good, on a connection that was
 * fine. There was no position — the watch never called back and never failed — so there were
 * no cells, so no socket was ever opened, and the app had no way of saying so. A watch that
 * says nothing has to time out here, because nothing downstream can tell the difference
 * between "no position yet" and "no position ever".
 */
describe('usePosition', () => {
  type Watcher = {
    ok: PositionCallback;
    fail: PositionErrorCallback;
  };
  let watchers: Watcher[];
  let cleared: number[];
  let host: HTMLDivElement;
  let root: Root;
  let seen: { status: GeoStatus; fix: unknown };

  const Probe = (): ReactNode => {
    seen = usePosition(true);
    return null;
  };

  const fix = (lat: number): GeolocationPosition =>
    ({
      coords: { latitude: lat, longitude: 6.14, speed: 20, heading: 90 },
      timestamp: Date.now(),
    }) as GeolocationPosition;
  const error = (code: number): GeolocationPositionError =>
    ({
      code,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }) as GeolocationPositionError;

  beforeEach(() => {
    vi.useFakeTimers();
    watchers = [];
    cleared = [];
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: PositionCallback, fail: PositionErrorCallback): number => {
          watchers.push({ ok, fail });
          return watchers.length;
        },
        clearWatch: (id: number): void => void cleared.push(id),
      },
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it('gives up waiting on a device that never answers, so the app can run as a spectator', () => {
    expect(seen.status).toBe('idle');
    act(() => vi.advanceTimersByTime(20_001));
    expect(seen.status).toBe('unavailable');
  });

  it('takes a late fix, so a slow phone is a driver again', () => {
    act(() => vi.advanceTimersByTime(20_001));
    expect(seen.status).toBe('unavailable');
    act(() => watchers[0]?.ok(fix(46.2)));
    expect(seen.status).toBe('granted');
    expect(seen.fix).not.toBeNull();
  });

  it('says denied the moment the driver says no, without waiting out the clock', () => {
    act(() => watchers[0]?.fail(error(1)));
    expect(seen.status).toBe('denied');
  });

  it('rides out a dropped fix mid-drive rather than demoting the driver', () => {
    act(() => watchers[0]?.ok(fix(46.2)));
    // A tunnel: POSITION_UNAVAILABLE on a device that was working a second ago.
    act(() => watchers[0]?.fail(error(2)));
    expect(seen.status).toBe('granted');
  });

  it('replaces a watch that went quiet while the tab was away', () => {
    act(() => watchers[0]?.ok(fix(46.2)));
    act(() => vi.advanceTimersByTime(31_000));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(watchers).toHaveLength(2);
    expect(cleared).toEqual([1]);
  });

  it('leaves a watch that is still talking alone', () => {
    act(() => watchers[0]?.ok(fix(46.2)));
    act(() => vi.advanceTimersByTime(1_000));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(watchers).toHaveLength(1);
  });
});
