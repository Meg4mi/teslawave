import type { TeslaModel } from '@teslawave/protocol';
import { colourOf } from '@teslawave/protocol';
import { MODEL_ART } from './model-art';
import { buildCarScene, type Paint, type Scene } from './car-scene';

/**
 * Top-down car sprites, rasterised once per (model, colour, dpr, variant) and reused.
 *
 * The drawing comes from `car-scene.ts`, the same list of operations the SVG component
 * renders in the UI. This file only bakes it into a bitmap with the glow and the ring: on an
 * Intel Atom a gradient or a clip on twenty sprites per frame is the difference between
 * 60 fps and a slideshow, and blur is banned outright (ADR-0014).
 */
export type SpriteVariant = 'other' | 'self';

/**
 * A Model 3 is this many CSS pixels long, and every other model is drawn to the same scale —
 * so a Cybertruck really is a fifth longer than a Model 3 on screen, as it is on the road.
 * The renderer scales by this reference, not by each sprite's own length.
 */
export const SPRITE_LENGTH = 58;
const REFERENCE_LENGTH_MM = MODEL_ART['3'].lengthMm;
const GLOW_PAD = 16;

export type Sprite = { canvas: HTMLCanvasElement; size: number; dpr: number };

const cache = new Map<string, Sprite>();

const paintOf = (ctx: CanvasRenderingContext2D, paint: Paint): string | CanvasGradient => {
  if (typeof paint === 'string') return paint;
  const g = ctx.createLinearGradient(paint.from[0], paint.from[1], paint.to[0], paint.to[1]);
  for (const [offset, colour] of paint.stops) g.addColorStop(offset, colour);
  return g;
};

/**
 * Draw a scene into a context whose transform already maps millimetres to device pixels.
 * `pxPerMm` is only used to honour minimum stroke widths.
 */
export function paintScene(ctx: CanvasRenderingContext2D, scene: Scene, pxPerMm: number): void {
  const paths = new Map<string, Path2D>();
  const pathOf = (d: string): Path2D => {
    let p = paths.get(d);
    if (!p) {
      p = new Path2D(d);
      paths.set(d, p);
    }
    return p;
  };
  ctx.lineJoin = 'round';
  for (const op of scene.ops) {
    ctx.save();
    if (op.clip) {
      const clip = scene.clips[op.clip];
      if (clip) ctx.clip(pathOf(clip));
    }
    if (op.alpha !== undefined) ctx.globalAlpha = op.alpha;
    const path = pathOf(op.d);
    const draw = (): void => {
      if (op.kind === 'fill') {
        ctx.fillStyle = paintOf(ctx, op.paint);
        if (op.offset) {
          ctx.save();
          ctx.translate(op.offset[0], op.offset[1]);
          ctx.fill(path);
          ctx.restore();
        } else ctx.fill(path);
      } else {
        ctx.strokeStyle = paintOf(ctx, op.paint);
        ctx.lineCap = op.cap ?? 'butt';
        ctx.lineWidth = Math.max(op.width, op.minPx === undefined ? 0 : op.minPx / pxPerMm);
        ctx.stroke(path);
      }
    };
    draw();
    if (op.mirror) {
      ctx.scale(-1, 1);
      draw();
    }
    ctx.restore();
  }
}

export function getSprite(
  model: TeslaModel,
  colourId: string,
  dpr: number,
  variant: SpriteVariant = 'other',
): Sprite {
  const key = `${model}|${colourId}|${dpr}|${variant}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const art = MODEL_ART[model];
  // Millimetres to CSS pixels. One factor for every model, so their relative sizes are real.
  const scale = (SPRITE_LENGTH / REFERENCE_LENGTH_MM) * (variant === 'self' ? 1.08 : 1);
  const length = art.lengthMm * scale;
  const size = Math.ceil(length + GLOW_PAD * 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(size * dpr);
  canvas.height = Math.ceil(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, size, dpr };

  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);

  const base = colourOf(colourId).hex;
  const glowColour = variant === 'self' ? '#6ee7ff' : base;

  // A tight baked glow. Enough to lift the car off the map, not enough to become the car.
  const glow = ctx.createRadialGradient(0, 0, length * 0.3, 0, 0, size / 2);
  glow.addColorStop(0, `${glowColour}30`);
  glow.addColorStop(0.5, `${glowColour}10`);
  glow.addColorStop(1, `${glowColour}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.scale(scale, scale);
  paintScene(ctx, buildCarScene(model, colourId), scale * dpr);
  ctx.restore();

  // Your own car wears a ring, so you can always find yourself.
  if (variant === 'self') {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, length * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sprite = { canvas, size, dpr };
  cache.set(key, sprite);
  return sprite;
}

export function clearSpriteCache(): void {
  cache.clear();
}
