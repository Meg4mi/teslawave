import { colourOf, type TeslaModel } from '@teslawave/protocol';

/**
 * Top-down car sprites, rasterised once per (model, colour, dpr, variant) and reused.
 *
 * The glow is drawn INTO the bitmap at rasterisation time. On an Intel Atom a runtime
 * shadowBlur or filter on twenty sprites per frame is the difference between 60 fps and a
 * slideshow, and both are banned by the design system anyway (ADR-0014).
 */
export type SpriteVariant = 'other' | 'self';

/** Length of a car in CSS pixels on screen. */
export const SPRITE_LENGTH = 46;
const GLOW_PAD = 22;

type Shape = {
  /** width / length */
  ratio: number;
  nose: number;
  tail: number;
  shoulder: number;
  angular?: boolean;
};

const SHAPES: Record<TeslaModel, Shape> = {
  '3': { ratio: 0.44, nose: 0.6, tail: 0.72, shoulder: 0.34 },
  Y: { ratio: 0.47, nose: 0.68, tail: 0.82, shoulder: 0.3 },
  S: { ratio: 0.43, nose: 0.56, tail: 0.66, shoulder: 0.36 },
  X: { ratio: 0.49, nose: 0.66, tail: 0.8, shoulder: 0.32 },
  CT: { ratio: 0.5, nose: 0.74, tail: 0.86, shoulder: 0.5, angular: true },
};

const bodyPath = (shape: Shape, length: number, width: number): Path2D => {
  const p = new Path2D();
  const halfW = width / 2;
  const noseW = halfW * shape.nose;
  const tailW = halfW * shape.tail;
  const shoulder = length * shape.shoulder;

  if (shape.angular) {
    // Cybertruck: one straight wedge, no curves anywhere.
    p.moveTo(-noseW, -length / 2 + length * 0.06);
    p.lineTo(noseW, -length / 2 + length * 0.06);
    p.lineTo(halfW, -length * 0.06);
    p.lineTo(halfW, length * 0.34);
    p.lineTo(tailW, length / 2);
    p.lineTo(-tailW, length / 2);
    p.lineTo(-halfW, length * 0.34);
    p.lineTo(-halfW, -length * 0.06);
    p.closePath();
    return p;
  }

  p.moveTo(0, -length / 2);
  p.quadraticCurveTo(noseW, -length / 2, noseW, -length / 2 + length * 0.06);
  p.quadraticCurveTo(halfW, -shoulder, halfW, -length * 0.04);
  p.lineTo(halfW, length * 0.16);
  p.quadraticCurveTo(halfW, length / 2 - length * 0.02, tailW, length / 2);
  p.lineTo(-tailW, length / 2);
  p.quadraticCurveTo(-halfW, length / 2 - length * 0.02, -halfW, length * 0.16);
  p.lineTo(-halfW, -length * 0.04);
  p.quadraticCurveTo(-halfW, -shoulder, -noseW, -length / 2 + length * 0.06);
  p.quadraticCurveTo(-noseW, -length / 2, 0, -length / 2);
  p.closePath();
  return p;
};

const glassPath = (shape: Shape, length: number, width: number): Path2D => {
  const p = new Path2D();
  const halfW = (width / 2) * 0.72;
  const top = -length * 0.16;
  const bottom = length * 0.24;
  if (shape.angular) {
    p.moveTo(-halfW * 0.8, top);
    p.lineTo(halfW * 0.8, top);
    p.lineTo(halfW, bottom);
    p.lineTo(-halfW, bottom);
    p.closePath();
    return p;
  }
  p.moveTo(0, top);
  p.quadraticCurveTo(halfW, top + length * 0.04, halfW, top + length * 0.16);
  p.quadraticCurveTo(halfW, bottom, 0, bottom);
  p.quadraticCurveTo(-halfW, bottom, -halfW, top + length * 0.16);
  p.quadraticCurveTo(-halfW, top + length * 0.04, 0, top);
  p.closePath();
  return p;
};

const mix = (hex: string, target: string, amount: number): string => {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const c = (a: number, b: number): number => Math.round(a + (b - a) * amount);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
};

export type Sprite = { canvas: HTMLCanvasElement; size: number; dpr: number };

const cache = new Map<string, Sprite>();

export function getSprite(
  model: TeslaModel,
  colourId: string,
  dpr: number,
  variant: SpriteVariant = 'other',
): Sprite {
  const key = `${model}|${colourId}|${dpr}|${variant}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const shape = SHAPES[model];
  const length = SPRITE_LENGTH * (variant === 'self' ? 1.12 : 1);
  const width = length * shape.ratio;
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

  // 1. The baked glow: a radial gradient, drawn once, never at runtime.
  const glow = ctx.createRadialGradient(0, 0, length * 0.28, 0, 0, size / 2);
  glow.addColorStop(0, `${glowColour}66`);
  glow.addColorStop(0.45, `${glowColour}22`);
  glow.addColorStop(1, `${glowColour}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // 2. A soft contact shadow so the car sits on the map rather than floating over it.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.save();
  ctx.translate(0, length * 0.03);
  ctx.fill(bodyPath(shape, length * 1.04, width * 1.1));
  ctx.restore();

  // 3. Body, lit slightly from the nose so the direction reads at a glance.
  const body = bodyPath(shape, length, width);
  const shade = ctx.createLinearGradient(0, -length / 2, 0, length / 2);
  shade.addColorStop(0, mix(base, '#ffffff', 0.22));
  shade.addColorStop(0.55, base);
  shade.addColorStop(1, mix(base, '#000000', 0.3));
  ctx.fillStyle = shade;
  ctx.fill(body);

  ctx.lineWidth = 1;
  ctx.strokeStyle = mix(base, '#000000', 0.55);
  ctx.stroke(body);

  // 4. Glass.
  ctx.fillStyle = mix(base, '#0b0e13', 0.62);
  ctx.fill(glassPath(shape, length, width));

  // 5. Light bar at the nose. The only warm pixels on a car.
  ctx.fillStyle = 'rgba(255, 232, 200, 0.75)';
  const barW = width * (shape.angular ? 0.62 : 0.46);
  ctx.fillRect(-barW / 2, -length / 2 + length * 0.035, barW, Math.max(1, length * 0.025));

  // 6. Your own car wears a ring, so you can always find yourself.
  if (variant === 'self') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, length * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sprite = { canvas, size, dpr };
  cache.set(key, sprite);
  return sprite;
}

export function clearSpriteCache(): void {
  cache.clear();
}
