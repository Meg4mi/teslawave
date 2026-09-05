import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeAvailability } from './sockets';

const answer = (status: number, body = ''): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
};

describe('probeAvailability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the Worker's own answers", async () => {
    answer(426);
    expect(await probeAvailability()).toBeNull();
    answer(429);
    expect(await probeAvailability()).toBe('budget');
    answer(503);
    expect(await probeAvailability()).toBe('paused');
  });

  it('recognises the page Cloudflare serves when the daily plan limit is spent', async () => {
    answer(200, '<html><title>Error 1027</title><p>the owner has reached their plan limits</p></html>');
    expect(await probeAvailability()).toBe('budget');
    answer(502, 'hub unavailable');
    expect(await probeAvailability()).toBeNull();
  });

  it('says nothing when the network is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await probeAvailability()).toBeNull();
  });
});
