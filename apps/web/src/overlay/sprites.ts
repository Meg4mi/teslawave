import { colourOf, type TeslaModel } from '@teslawave/protocol';

/**
 * Top-down car sprites, rasterised once per (model, colour, dpr, variant) and reused.
 *
 * Everything is baked into the bitmap at rasterisation time: the glow, the shading, the
 * shadow. On an Intel Atom a runtime shadowBlur or filter on twenty sprites per frame is the
 * difference between 60 fps and a slideshow, and both are banned by the design system
 * anyway (ADR-0014).
 *
 * What makes a shape read as a car from directly above, in rough order of importance:
 * wheels poking out at the corners, a canopy that is narrower than the body, mirrors, and a
 * front that is clearly not the back. A rounded rectangle with a blob in the middle reads as
 * a bar of soap, which is what this used to be.
 */
export type SpriteVariant = 'other' | 'self';

/** Length of a car in CSS pixels on screen. */
export const SPRITE_LENGTH = 58;
const GLOW_PAD = 16;

/** A point on the right-hand outline, with the corner radius to round it by. */
type Pt = { x: number; y: number; r?: number };

type ModelSpec = {
  /** Width as a fraction of length. */
  width: number;
  /** Right-hand outline from the nose to the tail; the left is mirrored. */
  outline: Pt[];
  /** Wheel centres as fractions of length, front negative. */
  axles: [number, number];
  wheel: { length: number; width: number };
  /** Glass canopy: windshield base, roof, rear glass, as fractions of length. */
  canopy: { front: number; rear: number; halfWidth: number; shoulder: number };
  mirrors: { y: number; reach: number };
  /** Cybertruck only: where the flat bed starts. */
  bed?: number;
  angular?: boolean;
};

/*
 * Proportions are the recognisable part: the 3 is compact with a fastback, the Y is the same
 * footprint but taller-shouldered and blunter, the S is long and low, the X is the widest
 * with a canopy that runs almost to the nose, and the Cybertruck is a straight-edged wedge.
 */
const MODELS: Record<TeslaModel, ModelSpec> = {
  '3': {
    width: 0.39,
    outline: [
      { x: 0.4, y: -0.5, r: 0.22 },
      { x: 0.86, y: -0.38, r: 0.3 },
      { x: 1, y: -0.14, r: 0.2 },
      { x: 1, y: 0.16, r: 0.2 },
      { x: 0.88, y: 0.42, r: 0.28 },
      { x: 0.46, y: 0.5, r: 0.22 },
    ],
    axles: [-0.28, 0.3],
    wheel: { length: 0.16, width: 0.075 },
    canopy: { front: -0.11, rear: 0.21, halfWidth: 0.58, shoulder: 0.05 },
    mirrors: { y: -0.11, reach: 0.26 },
  },
  Y: {
    width: 0.41,
    outline: [
      { x: 0.5, y: -0.5, r: 0.2 },
      { x: 0.9, y: -0.4, r: 0.24 },
      { x: 1, y: -0.18, r: 0.16 },
      { x: 1, y: 0.24, r: 0.16 },
      { x: 0.94, y: 0.44, r: 0.2 },
      { x: 0.56, y: 0.5, r: 0.2 },
    ],
    axles: [-0.28, 0.3],
    wheel: { length: 0.16, width: 0.08 },
    canopy: { front: -0.13, rear: 0.28, halfWidth: 0.62, shoulder: 0.04 },
    mirrors: { y: -0.13, reach: 0.26 },
  },
  S: {
    width: 0.38,
    outline: [
      { x: 0.34, y: -0.5, r: 0.24 },
      { x: 0.82, y: -0.4, r: 0.34 },
      { x: 1, y: -0.12, r: 0.22 },
      { x: 1, y: 0.14, r: 0.22 },
      { x: 0.84, y: 0.42, r: 0.3 },
      { x: 0.4, y: 0.5, r: 0.24 },
    ],
    axles: [-0.3, 0.31],
    wheel: { length: 0.15, width: 0.072 },
    canopy: { front: -0.06, rear: 0.24, halfWidth: 0.56, shoulder: 0.07 },
    mirrors: { y: -0.08, reach: 0.25 },
  },
  X: {
    width: 0.43,
    outline: [
      { x: 0.52, y: -0.5, r: 0.2 },
      { x: 0.92, y: -0.38, r: 0.24 },
      { x: 1, y: -0.16, r: 0.16 },
      { x: 1, y: 0.22, r: 0.16 },
      { x: 0.92, y: 0.44, r: 0.2 },
      { x: 0.54, y: 0.5, r: 0.2 },
    ],
    axles: [-0.29, 0.3],
    wheel: { length: 0.16, width: 0.082 },
    // The X's windscreen runs back over the driver's head, so its canopy starts much further forward.
    canopy: { front: -0.24, rear: 0.26, halfWidth: 0.64, shoulder: 0.03 },
    mirrors: { y: -0.12, reach: 0.26 },
  },
  CT: {
    width: 0.44,
    outline: [
      { x: 0.46, y: -0.5 },
      { x: 0.94, y: -0.26 },
      { x: 1, y: -0.04 },
      { x: 1, y: 0.46 },
      { x: 0.92, y: 0.5 },
    ],
    axles: [-0.27, 0.31],
    wheel: { length: 0.18, width: 0.095 },
    canopy: { front: -0.2, rear: 0.04, halfWidth: 0.7, shoulder: 0 },
    mirrors: { y: -0.06, reach: 0.22 },
    bed: 0.08,
    angular: true,
  },
};

/** Build a closed, symmetric outline from the right-hand points. */
function outlinePath(spec: ModelSpec, length: number, halfWidth: number): Path2D {
  const pts: Pt[] = [];
  for (const p of spec.outline) pts.push({ x: p.x * halfWidth, y: p.y * length, ...(p.r === undefined ? {} : { r: p.r * halfWidth }) });
  // Mirror back up the left-hand side.
  for (let i = spec.outline.length - 1; i >= 0; i--) {
    const p = spec.outline[i];
    if (!p) continue;
    pts.push({ x: -p.x * halfWidth, y: p.y * length, ...(p.r === undefined ? {} : { r: p.r * halfWidth }) });
  }

  const path = new Path2D();
  const n = pts.length;
  const first = pts[0];
  if (!first) return path;
  path.moveTo((first.x + (pts[n - 1]?.x ?? 0)) / 2, (first.y + (pts[n - 1]?.y ?? 0)) / 2);
  for (let i = 0; i < n; i++) {
    const current = pts[i];
    const next = pts[(i + 1) % n];
    if (!current || !next) continue;
    const radius = spec.angular ? 0 : (current.r ?? halfWidth * 0.12);
    if (radius > 0) path.arcTo(current.x, current.y, next.x, next.y, radius);
    else path.lineTo(current.x, current.y);
  }
  path.closePath();
  return path;
}

const roundedRect = (x: number, y: number, w: number, h: number, r: number): Path2D => {
  const path = new Path2D();
  path.moveTo(x - w / 2 + r, y - h / 2);
  path.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
  path.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
  path.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
  path.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
  path.closePath();
  return path;
};

/** Windshield, roof and rear glass as one canopy, narrower at both ends. */
function canopyPath(spec: ModelSpec, length: number, halfWidth: number): Path2D {
  const { front, rear, halfWidth: cw, shoulder } = spec.canopy;
  const w = halfWidth * cw;
  const y0 = front * length;
  const y1 = rear * length;
  const path = new Path2D();
  if (spec.angular) {
    path.moveTo(-w * 0.62, y0);
    path.lineTo(w * 0.62, y0);
    path.lineTo(w, y1);
    path.lineTo(-w, y1);
    path.closePath();
    return path;
  }
  const mid = y0 + (y1 - y0) * 0.45;
  const inset = shoulder * length;
  path.moveTo(0, y0);
  path.quadraticCurveTo(w * 0.82, y0 + inset, w, mid);
  path.quadraticCurveTo(w * 0.94, y1 - inset, w * 0.5, y1);
  path.lineTo(-w * 0.5, y1);
  path.quadraticCurveTo(-w * 0.94, y1 - inset, -w, mid);
  path.quadraticCurveTo(-w * 0.82, y0 + inset, 0, y0);
  path.closePath();
  return path;
}

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

  const spec = MODELS[model];
  const length = SPRITE_LENGTH * (variant === 'self' ? 1.1 : 1);
  const halfWidth = (length * spec.width) / 2;
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
  const body = outlinePath(spec, length, halfWidth);

  // 1. A tight baked glow. Enough to lift the car off the map, not enough to become the car.
  const glow = ctx.createRadialGradient(0, 0, length * 0.34, 0, 0, size / 2);
  glow.addColorStop(0, `${glowColour}3d`);
  glow.addColorStop(0.5, `${glowColour}14`);
  glow.addColorStop(1, `${glowColour}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // 2. Wheels, under the body and poking out at the corners. The strongest "this is a car" cue.
  ctx.fillStyle = 'rgba(9, 11, 15, 0.92)';
  const wheelLength = spec.wheel.length * length;
  const wheelWidth = spec.wheel.width * length;
  for (const axle of spec.axles)
    for (const side of [-1, 1]) {
      const x = side * (halfWidth + wheelWidth * 0.16);
      ctx.fill(
        roundedRect(x, axle * length, wheelWidth, wheelLength, spec.angular ? 1 : wheelWidth * 0.4),
      );
    }

  // 3. Contact shadow, just enough to sit on the map rather than float over it.
  ctx.save();
  ctx.translate(0, length * 0.018);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill(outlinePath(spec, length * 1.015, halfWidth * 1.03));
  ctx.restore();

  // 4. Mirrors.
  const mirrorY = spec.mirrors.y * length;
  const mirrorW = spec.mirrors.reach * halfWidth;
  ctx.fillStyle = mix(base, '#000000', 0.35);
  for (const side of [-1, 1])
    ctx.fill(
      roundedRect(
        side * (halfWidth + mirrorW * 0.35),
        mirrorY,
        mirrorW,
        length * 0.055,
        spec.angular ? 0.5 : length * 0.02,
      ),
    );

  // 5. Body, lit from the nose so which way it points is never in doubt.
  const shade = ctx.createLinearGradient(0, -length / 2, 0, length / 2);
  shade.addColorStop(0, mix(base, '#ffffff', 0.26));
  shade.addColorStop(0.42, base);
  shade.addColorStop(1, mix(base, '#000000', 0.34));
  ctx.fillStyle = shade;
  ctx.fill(body);
  ctx.lineWidth = Math.max(0.6, length * 0.018);
  ctx.strokeStyle = mix(base, '#000000', 0.6);
  ctx.stroke(body);

  // 6. Glass. Darker than any paint, so it reads as glass on a white car too.
  const glass = ctx.createLinearGradient(0, spec.canopy.front * length, 0, spec.canopy.rear * length);
  glass.addColorStop(0, 'rgba(14, 20, 30, 0.94)');
  glass.addColorStop(0.5, 'rgba(30, 41, 56, 0.9)');
  glass.addColorStop(1, 'rgba(16, 22, 32, 0.94)');
  ctx.fillStyle = glass;
  ctx.fill(canopyPath(spec, length, halfWidth));

  // 7. A soft crease along the bonnet, so the body reads as curved metal rather than a slab.
  if (!spec.angular) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = Math.max(0.5, length * 0.012);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * halfWidth * 0.42, -length * 0.44);
      ctx.lineTo(side * halfWidth * 0.5, spec.canopy.front * length - length * 0.02);
      ctx.stroke();
    }
  }

  // 8. Cybertruck bed: a flat tonneau instead of a rear window.
  if (spec.bed !== undefined) {
    ctx.fillStyle = mix(base, '#000000', 0.42);
    ctx.beginPath();
    ctx.moveTo(-halfWidth * 0.86, spec.bed * length);
    ctx.lineTo(halfWidth * 0.86, spec.bed * length);
    ctx.lineTo(halfWidth * 0.8, length * 0.44);
    ctx.lineTo(-halfWidth * 0.8, length * 0.44);
    ctx.closePath();
    ctx.fill();
  }

  // 9. Lights. Warm at the nose, red across the tail: you can tell a car's direction at a
  // glance in a mirror, and the same has to be true here.
  ctx.fillStyle = 'rgba(255, 236, 205, 0.85)';
  const headW = halfWidth * (spec.angular ? 1.5 : 1.1);
  ctx.fill(roundedRect(0, -length * 0.455, headW, length * 0.028, length * 0.012));
  ctx.fillStyle = 'rgba(255, 70, 70, 0.8)';
  const tailW = halfWidth * (spec.angular ? 1.6 : 1.2);
  ctx.fill(roundedRect(0, length * 0.462, tailW, length * 0.026, length * 0.012));

  // 10. Your own car wears a ring, so you can always find yourself.
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
