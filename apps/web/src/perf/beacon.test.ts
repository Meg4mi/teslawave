import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEACON_INTERVAL_MS, FIRST_BEACON_MS, currentSample, startBeacon } from './beacon';
import { noteRender, recordFrameCost, resetFrameStats } from './frames';

describe('performance beacon', () => {
  let posted: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    posted = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        posted.push(JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }),
    );
    resetFrameStats();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('says only what a screen is and how it copes, never who is on it', () => {
    for (let i = 0; i < 400; i++) recordFrameCost(i % 2 === 0 ? 2 : 6);
    noteRender({ halfRate: true, lowRes: false, cars: 12 });
    const sample = currentSample();
    expect(sample).toMatchObject({ v: 1, samples: 400, halfRate: true, lowRes: false, cars: 12 });
    expect(sample.mean).toBeCloseTo(4, 1);
    expect(sample.p95).toBe(6);
    const keys = Object.keys(sample);
    for (const forbidden of ['lat', 'lng', 'id', 'secret', 'nick', 'model', 'colour'])
      expect(keys).not.toContain(forbidden);
  });

  it('waits for the map to settle, then reports now and again while the tab is visible', () => {
    const stop = startBeacon();
    for (let i = 0; i < 400; i++) recordFrameCost(3);
    vi.advanceTimersByTime(FIRST_BEACON_MS - 30_000);
    expect(posted).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(posted).toHaveLength(1);
    vi.advanceTimersByTime(BEACON_INTERVAL_MS - 60_000);
    expect(posted).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    expect(posted).toHaveLength(2);
    stop();
    vi.advanceTimersByTime(BEACON_INTERVAL_MS * 3);
    expect(posted).toHaveLength(2);
  });

  it('has nothing to say before there are enough frames', () => {
    const stop = startBeacon();
    for (let i = 0; i < 50; i++) recordFrameCost(3);
    vi.advanceTimersByTime(FIRST_BEACON_MS + 60_000);
    expect(posted).toHaveLength(0);
    stop();
  });
});
