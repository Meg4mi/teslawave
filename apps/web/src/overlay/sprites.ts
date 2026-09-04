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
  /** Width over length, from the real car. */
  width: number;
  /** Right-hand outline from nose to tail; the left is mirrored. */
  outline: Pt[];
  /** Wheel centres as fractions of length, front negative. */
  axles: [number, number];
  wheel: { length: number; width: number };
  /**
   * The glass roof, which is the most recognisable thing about a Tesla from above: one
   * continuous panel from the base of the windscreen to the end of the rear glass.
   */
  glass: { front: number; roofFront: number; roofRear: number; rear: number; halfWidth: number };
  /** Panel seams across the body: bonnet, doors, boot. Real cars show their gaps. */
  seams: number[];
  mirrors: { y: number; reach: number };
  /** Cybertruck only: where the vault starts. */
  bed?: number;
  angular?: boolean;
};

/*
 * Proportions come from the real cars (length x width in mm):
 * 3: 4694x1849, Y: 4751x1921, S: 4970x1964, X: 5037x2070, Cybertruck: 5683x2200.
 * The differences are small in numbers and obvious on screen, which is the point.
 */
const MODELS: Record<TeslaModel, ModelSpec> = {
  '3': {
    width: 0.394,
    outline: [
      { x: 0.42, y: -0.5, r: 0.3 },
      { x: 0.88, y: -0.39, r: 0.36 },
      { x: 1, y: -0.16, r: 0.24 },
      { x: 1, y: 0.14, r: 0.24 },
      { x: 0.9, y: 0.41, r: 0.34 },
      { x: 0.48, y: 0.5, r: 0.3 },
    ],
    axles: [-0.29, 0.3],
    wheel: { length: 0.155, width: 0.07 },
    // Short bonnet, glass roof running almost to the boot: the Model 3 signature.
    glass: { front: -0.14, roofFront: 0.01, roofRear: 0.14, rear: 0.26, halfWidth: 0.62 },
    seams: [-0.14, 0.03, 0.28],
    mirrors: { y: -0.12, reach: 0.3 },
  },
  Y: {
    width: 0.404,
    outline: [
      { x: 0.52, y: -0.5, r: 0.26 },
      { x: 0.92, y: -0.4, r: 0.3 },
      { x: 1, y: -0.19, r: 0.2 },
      { x: 1, y: 0.22, r: 0.2 },
      { x: 0.96, y: 0.43, r: 0.24 },
      { x: 0.6, y: 0.5, r: 0.26 },
    ],
    axles: [-0.29, 0.3],
    wheel: { length: 0.155, width: 0.076 },
    // Same glass roof, but the hatch ends it abruptly instead of tapering away.
    glass: { front: -0.16, roofFront: -0.01, roofRear: 0.2, rear: 0.3, halfWidth: 0.66 },
    seams: [-0.16, 0.02, 0.32],
    mirrors: { y: -0.14, reach: 0.3 },
  },
  S: {
    width: 0.395,
    outline: [
      { x: 0.36, y: -0.5, r: 0.34 },
      { x: 0.84, y: -0.41, r: 0.4 },
      { x: 1, y: -0.14, r: 0.28 },
      { x: 1, y: 0.12, r: 0.28 },
      { x: 0.86, y: 0.42, r: 0.36 },
      { x: 0.42, y: 0.5, r: 0.34 },
    ],
    axles: [-0.31, 0.31],
    wheel: { length: 0.15, width: 0.068 },
    // Long bonnet, long fastback: the glass sits further back than on a 3.
    glass: { front: -0.09, roofFront: 0.04, roofRear: 0.16, rear: 0.3, halfWidth: 0.6 },
    seams: [-0.09, 0.06, 0.32],
    mirrors: { y: -0.07, reach: 0.29 },
  },
  X: {
    width: 0.411,
    outline: [
      { x: 0.56, y: -0.5, r: 0.24 },
      { x: 0.94, y: -0.39, r: 0.28 },
      { x: 1, y: -0.17, r: 0.2 },
      { x: 1, y: 0.2, r: 0.2 },
      { x: 0.94, y: 0.43, r: 0.24 },
      { x: 0.58, y: 0.5, r: 0.24 },
    ],
    axles: [-0.3, 0.3],
    wheel: { length: 0.155, width: 0.078 },
    // The panoramic windscreen carries on over the front seats, so the glass starts almost
    // at the nose. Nothing else on the road looks like this from above.
    glass: { front: -0.32, roofFront: -0.12, roofRear: 0.18, rear: 0.28, halfWidth: 0.68 },
    seams: [-0.32, -0.1, 0.3],
    mirrors: { y: -0.13, reach: 0.3 },
  },
  CT: {
    width: 0.387,
    outline: [
      { x: 0.34, y: -0.5 },
      { x: 0.9, y: -0.3 },
      { x: 1, y: -0.12 },
      { x: 1, y: 0.42 },
      { x: 0.94, y: 0.5 },
    ],
    axles: [-0.28, 0.32],
    wheel: { length: 0.17, width: 0.088 },
    // One straight sheet of glass over the cabin, then the vault.
    glass: { front: -0.3, roofFront: -0.16, roofRear: -0.02, rear: 0.02, halfWidth: 0.74 },
    seams: [-0.3, 0.04],
    mirrors: { y: -0.06, reach: 0.24 },
    bed: 0.06,
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

/**
 * The glass roof as one continuous panel: narrow where the windscreen meets the bonnet,
 * full width across the roof, narrowing again into the rear glass.
 */
function glassPath(spec: ModelSpec, length: number, halfWidth: number): Path2D {
  const g = spec.glass;
  const w = halfWidth * g.halfWidth;
  const front = g.front * length;
  const roofFront = g.roofFront * length;
  const roofRear = g.roofRear * length;
  const rear = g.rear * length;
  const path = new Path2D();

  if (spec.angular) {
    path.moveTo(-w * 0.58, front);
    path.lineTo(w * 0.58, front);
    path.lineTo(w, roofRear);
    path.lineTo(w * 0.92, rear);
    path.lineTo(-w * 0.92, rear);
    path.lineTo(-w, roofRear);
    path.closePath();
    return path;
  }

  path.moveTo(-w * 0.62, front);
  path.quadraticCurveTo(-w * 0.98, front + (roofFront - front) * 0.6, -w, roofFront);
  path.lineTo(-w, roofRear);
  path.quadraticCurveTo(-w * 0.96, rear - (rear - roofRear) * 0.4, -w * 0.5, rear);
  path.lineTo(w * 0.5, rear);
  path.quadraticCurveTo(w * 0.96, rear - (rear - roofRear) * 0.4, w, roofRear);
  path.lineTo(w, roofFront);
  path.quadraticCurveTo(w * 0.98, front + (roofFront - front) * 0.6, w * 0.62, front);
  path.closePath();
  return path;
}

/** Perceived brightness, 0 to 1, for deciding how much rim light a colour needs. */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
  glow.addColorStop(0, `${glowColour}2e`);
  glow.addColorStop(0.5, `${glowColour}0f`);
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

  /*
   * A rim light along the top edge. Solid Black on a dark map is invisible, and a car you
   * cannot see is worse than one whose paint is a shade off: the darker the colour, the more
   * rim it gets, so every car keeps a readable silhouette.
   */
  const brightness = luminance(base);
  const rim = Math.max(0, 0.5 - brightness) * 0.85;
  if (rim > 0.02) {
    ctx.save();
    ctx.clip(body);
    ctx.strokeStyle = `rgba(190, 214, 240, ${rim.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, length * 0.03);
    ctx.stroke(body);
    ctx.restore();
  }

  // 6. The glass roof, in one piece. Darker than any paint, so it reads as glass even on a
  // Pearl White car, and it is the single most recognisable thing about a Tesla from above.
  const g = spec.glass;
  const glass = ctx.createLinearGradient(0, g.front * length, 0, g.rear * length);
  glass.addColorStop(0, 'rgba(12, 18, 27, 0.95)');
  glass.addColorStop(0.35, 'rgba(34, 46, 63, 0.92)');
  glass.addColorStop(0.75, 'rgba(24, 33, 46, 0.93)');
  glass.addColorStop(1, 'rgba(14, 20, 30, 0.95)');
  ctx.fillStyle = glass;
  ctx.fill(glassPath(spec, length, halfWidth));

  // 7. Panel seams: the pillar lines across the glass, and the gaps between bonnet, doors
  // and boot. Cars are made of panels, and at this size the gaps are most of the realism.
  ctx.lineWidth = Math.max(0.4, length * 0.009);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  for (const y of [g.roofFront, g.roofRear]) {
    const w = halfWidth * g.halfWidth * 0.94;
    ctx.beginPath();
    ctx.moveTo(-w, y * length);
    ctx.lineTo(w, y * length);
    ctx.stroke();
  }
  ctx.strokeStyle = mix(base, '#000000', 0.5);
  for (const y of spec.seams) {
    ctx.beginPath();
    ctx.moveTo(-halfWidth * 0.98, y * length);
    ctx.lineTo(halfWidth * 0.98, y * length);
    ctx.stroke();
  }

  // 8. A soft crease down each side of the bonnet, so the body reads as curved metal.
  if (!spec.angular) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = Math.max(0.4, length * 0.01);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * halfWidth * 0.44, -length * 0.44);
      ctx.lineTo(side * halfWidth * 0.54, g.front * length - length * 0.02);
      ctx.stroke();
    }
  }

  // Cybertruck vault: a flat tonneau where a rear window would be.
  if (spec.bed !== undefined) {
    ctx.fillStyle = mix(base, '#000000', 0.5);
    ctx.beginPath();
    ctx.moveTo(-halfWidth * 0.9, spec.bed * length);
    ctx.lineTo(halfWidth * 0.9, spec.bed * length);
    ctx.lineTo(halfWidth * 0.84, length * 0.43);
    ctx.lineTo(-halfWidth * 0.84, length * 0.43);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.stroke();
  }

  // 9. Lights. Warm at the nose, red across the tail: you can tell a car's direction at a
  // glance in a mirror, and the same has to be true here.
  ctx.fillStyle = 'rgba(255, 242, 219, 0.72)';
  if (spec.angular) {
    ctx.fill(roundedRect(0, -length * 0.463, halfWidth * 1.4, length * 0.024, length * 0.008));
  } else {
    const lampW = halfWidth * 0.42;
    for (const side of [-1, 1])
      ctx.fill(
        roundedRect(side * halfWidth * 0.5, -length * 0.452, lampW, length * 0.026, length * 0.01),
      );
  }
  // The full-width tail bar: on a real one it is the thing you recognise from behind, and
  // here it is what tells you instantly which way a car is pointing.
  ctx.fillStyle = 'rgba(255, 64, 72, 0.92)';
  const tailW = halfWidth * (spec.angular ? 1.72 : 1.5);
  ctx.fill(roundedRect(0, length * 0.462, tailW, length * 0.028, length * 0.012));

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
