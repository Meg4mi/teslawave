import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrack, pushSample } from '@teslawave/protocol';
import { createRenderer, WAVE_TIMING, type RenderOptions } from './renderer';
import type { RenderCar } from '../sim/world';

/**
 * The wave's choreography, checked against a recording canvas rather than pixels: which arcs
 * are drawn, where, how large and how opaque, at each point on the wave's clock. This is
 * what keeps "the shockwave crosses the whole screen" true when someone tunes a constant.
 */
type Arc = { x: number; y: number; r: number; alpha: number; width: number; op: 'fill' | 'stroke' };
type Line = { from: [number, number]; to: [number, number]; alpha: number; width: number };

// Any screen will do; what matters is that the rings reach its farthest corner from wherever
// the other car is. (Not the car's own size, which the CSS check rightly refuses to see typed.)
const W = 1600;
const H = 1000;

function recordingContext(): { ctx: CanvasRenderingContext2D; arcs: Arc[]; lines: Line[] } {
  const arcs: Arc[] = [];
  const lines: Line[] = [];
  let pending: Arc | null = null;
  let path: Array<[number, number]> = [];
  const state = { globalAlpha: 1, lineWidth: 1 };
  const noop = (): void => undefined;
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_, key: string) {
      if (key === 'globalAlpha') return state.globalAlpha;
      if (key === 'lineWidth') return state.lineWidth;
      // Sprite baking wants gradients; they are paint, not geometry, and are not recorded.
      if (key === 'createRadialGradient' || key === 'createLinearGradient')
        return (): { addColorStop: () => void } => ({ addColorStop: noop });
      if (key === 'beginPath')
        return (): void => {
          pending = null;
          path = [];
        };
      if (key === 'arc')
        return (x: number, y: number, r: number): void => {
          pending = { x, y, r, alpha: state.globalAlpha, width: state.lineWidth, op: 'stroke' };
        };
      if (key === 'moveTo' || key === 'lineTo')
        return (x: number, y: number): void => {
          path.push([x, y]);
        };
      if (key === 'fill' || key === 'stroke')
        return (): void => {
          if (pending) arcs.push({ ...pending, op: key, alpha: state.globalAlpha });
          const [from, to] = path;
          if (path.length === 2 && from && to)
            lines.push({ from, to, alpha: state.globalAlpha, width: state.lineWidth });
          pending = null;
          path = [];
        };
      return noop;
    },
    set(_, key: string, value: number) {
      if (key === 'globalAlpha') state.globalAlpha = value;
      if (key === 'lineWidth') state.lineWidth = value;
      return true;
    },
  });
  return { ctx, arcs, lines };
}

/** A flat projection: 1 px per 0.00001 degrees, self at the centre of the screen. */
const project = (lng: number, lat: number): { x: number; y: number } => ({
  x: W / 2 + (lng - 6) * 100_000,
  y: H / 2 - (lat - 46) * 100_000,
});

const car = (id: string, lat: number, lng: number): RenderCar => {
  const track = createTrack();
  const placement = { lat, lng, heading: 0, speed: 10 };
  pushSample(track, { ...placement, ts: 0 }, 0);
  return {
    id,
    model: 'Y',
    colour: 'deepblue',
    waves: 0,
    since: 0,
    cell: 'u0hq',
    hub: 'u0',
    track,
    trail: [],
    appearedAt: -10_000,
    lastServerTs: 0,
    placement,
    distanceM: 100,
  };
};

// The other car is up and to the left of you, off the exact centre so anchors are unambiguous.
const OTHER = car('other', 46.0012, 5.9984);
const SELF = { lat: 46, lng: 6, heading: 0, model: '3', colour: 'pearl' };
const near = (a: Arc, [x, y]: [number, number]): boolean =>
  Math.abs(a.x - x) < 0.5 && Math.abs(a.y - y) < 0.5;

describe('the wave choreography', () => {
  let recording: ReturnType<typeof recordingContext>;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    // jsdom has no Path2D; the sprites are baked through one on the first frame.
    if (typeof globalThis.Path2D === 'undefined')
      (globalThis as { Path2D?: unknown }).Path2D = class FakePath2D {
        d: string;
        constructor(d = '') {
          this.d = d;
        }
      };
    recording = recordingContext();
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() =>
      recording.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  const setup = (): ReturnType<typeof createRenderer> => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    return createRenderer(canvas);
  };

  const options: RenderOptions = {
    cars: [OTHER],
    self: SELF,
    nearbyId: null,
    selectedId: null,
    trails: false,
    ambient: false,
    bearing: 0,
    zoom: 15.5,
  };

  // Sprites are baked through getContext too, on the renderer's first frame; a throwaway
  // frame first, so each measured frame holds only what that frame drew.
  const frame = (renderer: ReturnType<typeof createRenderer>, age: number): void => {
    recording.arcs.length = 0;
    recording.lines.length = 0;
    renderer.render(10_000 + age, project, options, 1);
  };
  const selfPx = project(SELF.lng, SELF.lat);
  const selfAt: [number, number] = [selfPx.x, selfPx.y];
  const otherPx = project(OTHER.placement.lng, OTHER.placement.lat);
  const otherAt: [number, number] = [otherPx.x, otherPx.y];
  const cornerDistance = Math.hypot(
    Math.max(otherAt[0], W - otherAt[0]),
    Math.max(otherAt[1], H - otherAt[1]),
  );
  const strokesAt = (where: [number, number], width: number): Arc[] =>
    recording.arcs.filter((a) => a.op === 'stroke' && a.width === width && near(a, where));

  it('flies a comet from them to you, then lights the line between you', () => {
    const renderer = setup();
    frame(renderer, -1);
    renderer.addWave({ kind: 'received', fromId: 'other', toId: null });

    frame(renderer, 300);
    const comet = recording.arcs.filter((a) => a.op === 'fill');
    // A head and its ghosts, all on the segment between the two cars.
    expect(comet.length).toBeGreaterThanOrEqual(5);
    for (const dot of comet) {
      const along = (dot.x - otherAt[0]) / (selfAt[0] - otherAt[0]);
      expect(along).toBeGreaterThan(0);
      expect(along).toBeLessThan(1);
      const expectedY = otherAt[1] + along * (selfAt[1] - otherAt[1]);
      expect(Math.abs(dot.y - expectedY)).toBeLessThan(0.01);
    }
    const link = recording.lines.find((l) => l.width === 3);
    expect(link).toBeDefined();
    expect(link?.alpha).toBeGreaterThan(0.5);

    frame(renderer, WAVE_TIMING.flightMs + 50);
    expect(recording.arcs.filter((a) => a.op === 'fill')).toHaveLength(0);
  });

  it('pops your car and rings it when the wave lands', () => {
    const renderer = setup();
    frame(renderer, -1);
    renderer.addWave({ kind: 'received', fromId: 'other', toId: null });

    frame(renderer, WAVE_TIMING.impactAt + WAVE_TIMING.impactRingMs * 0.3);
    const [impact] = strokesAt(selfAt, 3);
    expect(impact).toBeDefined();
    expect(impact?.alpha).toBeGreaterThan(0.5);
  });

  it('sends five warm rings from their car until they have crossed the whole screen', () => {
    const renderer = setup();
    frame(renderer, -1);
    renderer.addWave({ kind: 'received', fromId: 'other', toId: null });

    // Midway: rings are on their way, thick, still clearly visible.
    frame(renderer, 900);
    const midway = strokesAt(otherAt, 5);
    expect(midway.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...midway.map((a) => a.alpha))).toBeGreaterThan(0.6);
    // Nothing has died early: the oldest ring is still on the screen, and still legible.
    const oldest = midway.sort((a, b) => b.r - a.r)[0];
    expect(oldest!.r).toBeLessThan(cornerDistance);
    expect(oldest!.alpha).toBeGreaterThan(0.4);

    // At the end of its life, the first ring has reached the farthest corner of the screen.
    frame(renderer, WAVE_TIMING.ringMs - 1);
    const [first] = strokesAt(otherAt, 5).sort((a, b) => b.r - a.r);
    expect(first).toBeDefined();
    expect(first!.r).toBeGreaterThan(cornerDistance);

    // Five distinct rings, over the life of the wave.
    let most = 0;
    for (let age = 0; age < WAVE_TIMING.totalMs; age += 50) {
      frame(renderer, age);
      most = Math.max(most, strokesAt(otherAt, 5).length);
    }
    expect(most).toBe(WAVE_TIMING.rings);

    // And then it is over: nothing of the wave remains.
    frame(renderer, WAVE_TIMING.totalMs + 1);
    expect(
      recording.arcs.filter((a) => a.width === 5 || a.width === 3 || a.op === 'fill'),
    ).toHaveLength(0);
    expect(recording.lines.filter((l) => l.width === 3)).toHaveLength(0);
  });

  it('keeps a sent wave modest: cyan rings from their car, a short way', () => {
    const renderer = setup();
    frame(renderer, -1);
    renderer.addWave({ kind: 'sent', fromId: null, toId: 'other' });

    // Before impact, no rings anywhere.
    frame(renderer, WAVE_TIMING.impactAt - 50);
    expect(recording.arcs.filter((a) => a.op === 'stroke' && a.width === 3)).toHaveLength(0);

    let largest = 0;
    for (let age = 0; age < WAVE_TIMING.totalMs; age += 50) {
      frame(renderer, age);
      for (const a of recording.arcs) {
        if (a.op !== 'stroke' || a.width !== 3) continue;
        // Everything a sent wave draws is on their car, never on yours.
        expect(near(a, otherAt)).toBe(true);
        largest = Math.max(largest, a.r);
      }
      // A sent wave never uses the received wave's thick stroke.
      expect(recording.arcs.filter((a) => a.width === 5)).toHaveLength(0);
    }
    expect(largest).toBeGreaterThan(200);
    expect(largest).toBeLessThan(300);
  });
});
