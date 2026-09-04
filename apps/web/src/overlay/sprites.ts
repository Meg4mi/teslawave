import { colourOf, type TeslaModel } from '@teslawave/protocol';
import { MODEL_ART, type Half, type ModelArt } from './model-art';

/**
 * Top-down car sprites, rasterised once per (model, colour, dpr, variant) and reused.
 *
 * The shapes come from `model-art.ts`, where each model is traced as its own outline in real
 * millimetres. This file is only the painting: it turns those outlines into a bitmap with the
 * glow, the shading and the contact shadow baked in. On an Intel Atom a runtime shadowBlur or
 * filter on twenty sprites per frame is the difference between 60 fps and a slideshow, and
 * both are banned by the design system anyway (ADR-0014).
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

/** Trace a half-outline and its mirror image into one closed path, scaled to pixels. */
function closedPath(half: Half, scale: number): Path2D {
  const path = new Path2D();
  path.moveTo(half.start[0] * scale, half.start[1] * scale);
  for (const seg of half.segs)
    path.bezierCurveTo(
      seg.c1[0] * scale,
      seg.c1[1] * scale,
      seg.c2[0] * scale,
      seg.c2[1] * scale,
      seg.to[0] * scale,
      seg.to[1] * scale,
    );
  // Back up the left-hand side: the same curve with x negated, walked in reverse.
  for (let i = half.segs.length - 1; i >= 0; i--) {
    const seg = half.segs[i];
    if (!seg) continue;
    const from = i === 0 ? half.start : (half.segs[i - 1]?.to ?? half.start);
    path.bezierCurveTo(
      -seg.c2[0] * scale,
      seg.c2[1] * scale,
      -seg.c1[0] * scale,
      seg.c1[1] * scale,
      -from[0] * scale,
      from[1] * scale,
    );
  }
  path.closePath();
  return path;
}

/**
 * The same outline pushed outward, for the contact shadow. Scaling about the centre would
 * lengthen the car as well as widen it; this only grows it enough to show at the edges.
 */
const grownPath = (half: Half, scale: number, grow: number): Path2D => closedPath(half, scale * grow);

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

/** The widest half-width of a traced outline, in millimetres. */
function halfWidthOf(art: ModelArt): number {
  let max = 0;
  for (const seg of art.body.segs) max = Math.max(max, Math.abs(seg.to[0]), Math.abs(seg.c1[0]));
  return max;
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
  const scale =
    (SPRITE_LENGTH / REFERENCE_LENGTH_MM) * (variant === 'self' ? 1.08 : 1);
  const length = art.lengthMm * scale;
  const halfWidth = halfWidthOf(art) * scale;
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
  const body = closedPath(art.body, scale);
  const mm = (value: number): number => value * scale;

  // 1. A tight baked glow. Enough to lift the car off the map, not enough to become the car.
  const glow = ctx.createRadialGradient(0, 0, length * 0.34, 0, 0, size / 2);
  glow.addColorStop(0, `${glowColour}2e`);
  glow.addColorStop(0.5, `${glowColour}0f`);
  glow.addColorStop(1, `${glowColour}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // 2. Wheels, under the body and standing proud at the corners. The strongest "this is a
  // car" cue there is, and the tyre width and diameter are the real ones.
  ctx.fillStyle = 'rgba(8, 10, 14, 0.96)';
  for (const axle of art.wheels.axles)
    for (const side of [-1, 1]) {
      const x = side * (halfWidth + mm(art.wheels.proudMm) - mm(art.wheels.widthMm) / 2);
      ctx.fill(
        roundedRect(
          x,
          mm(axle),
          mm(art.wheels.widthMm),
          mm(art.wheels.lengthMm),
          art.angular ? 1 : mm(art.wheels.widthMm) * 0.35,
        ),
      );
    }

  // 3. Contact shadow, just enough to sit on the map rather than float over it.
  ctx.save();
  ctx.translate(0, length * 0.018);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fill(grownPath(art.body, scale, 1.02));
  ctx.restore();

  /*
   * 4. Mirrors, at the front of the front door where they actually are. They overlap the
   * bodywork rather than floating beside it: drawn clear of the body they read as antennae.
   */
  ctx.fillStyle = mix(base, '#000000', 0.35);
  for (const side of [-1, 1])
    ctx.fill(
      roundedRect(
        side * (halfWidth + mm(art.mirrors.reachMm) * 0.16),
        mm(art.mirrors.y),
        mm(art.mirrors.reachMm),
        mm(art.mirrors.chordMm),
        art.angular ? 0.5 : mm(60),
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
   * The tyres again, this time over the paint and clipped to it, so each arch shows the wheel
   * under it the way an overhead photograph does. Wheels are the strongest "this is a car"
   * cue there is, and hidden entirely under the bodywork — which is where the real track puts
   * them — the sprite loses it.
   */
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(9, 12, 17, 0.46)';
  for (const axle of art.wheels.axles)
    for (const side of [-1, 1])
      ctx.fill(
        roundedRect(
          side * (halfWidth + mm(art.wheels.proudMm) - mm(art.wheels.widthMm) / 2),
          mm(axle),
          mm(art.wheels.widthMm),
          mm(art.wheels.lengthMm),
          art.angular ? 1 : mm(art.wheels.widthMm) * 0.35,
        ),
      );
  ctx.restore();

  /*
   * A rim light along the outline. Solid Black on a dark map is invisible, and a car you
   * cannot see is worse than one whose paint is a shade off: the darker the colour, the more
   * rim it gets, so every car keeps a readable silhouette.
   */
  const rim = Math.max(0, 0.5 - luminance(base)) * 0.85;
  if (rim > 0.02) {
    ctx.save();
    ctx.clip(body);
    ctx.strokeStyle = `rgba(190, 214, 240, ${rim.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, length * 0.03);
    ctx.stroke(body);
    ctx.restore();
  }

  // 6. The greenhouse, in one piece, darker than any paint so it reads as glass even on a
  // Pearl White car. It is the single most recognisable thing about a Tesla from above.
  const glass = closedPath(art.glass, scale);
  const glassFill = ctx.createLinearGradient(0, mm(art.glass.start[1]), 0, length * 0.4);
  glassFill.addColorStop(0, 'rgba(12, 18, 27, 0.95)');
  glassFill.addColorStop(0.35, 'rgba(34, 46, 63, 0.92)');
  glassFill.addColorStop(0.75, 'rgba(24, 33, 46, 0.93)');
  glassFill.addColorStop(1, 'rgba(14, 20, 30, 0.95)');
  ctx.fillStyle = glassFill;
  ctx.fill(glass);

  // The painted header where the windscreen ends and the roof glass begins. On the X it sits
  // far back, because the windscreen carries on over the front seats.
  ctx.save();
  ctx.clip(glass);
  ctx.fillStyle = mix(base, '#000000', 0.2);
  ctx.fillRect(-halfWidth, mm(art.headerY) - mm(34), halfWidth * 2, mm(68));
  ctx.restore();

  // The Model 3's roof bar: painted body colour, straight across, splitting the glass in two.
  // Clipped to the glass, so it stops exactly at the edge of the panel rather than at a
  // guessed width.
  if (art.roofBarY !== undefined) {
    ctx.save();
    ctx.clip(glass);
    ctx.fillStyle = mix(base, '#000000', 0.12);
    ctx.fillRect(-halfWidth, mm(art.roofBarY) - mm(60), halfWidth * 2, mm(120));
    ctx.restore();
  }

  // The Model X's falcon wing cut lines, running up over the roof glass.
  if (art.falconSeamY) {
    ctx.save();
    ctx.clip(glass);
    // Inward from each flank, not across the whole roof: the hinge line stops short of the
    // centre, and drawn all the way over it turns the glass into a ladder.
    ctx.strokeStyle = 'rgba(186, 208, 236, 0.24)';
    ctx.lineWidth = Math.max(0.4, mm(20));
    for (const y of art.falconSeamY)
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * halfWidth, mm(y));
        ctx.lineTo(side * halfWidth * 0.34, mm(y) - mm(70));
        ctx.stroke();
      }
    ctx.restore();
  }

  // Cybertruck vault: a flat tonneau where a rear screen would be.
  if (art.vault) {
    ctx.fillStyle = mix(base, '#000000', 0.24);
    const vault = closedPath(art.vault, scale);
    ctx.fill(vault);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(0.4, mm(20));
    ctx.stroke(vault);
  }

  // 7. Panel gaps: bonnet and boot shut lines, clipped to the body so they stop at the
  // bodywork. Cars are made of panels, and at this size the gaps are most of the realism.
  ctx.save();
  ctx.clip(body);
  ctx.lineWidth = Math.max(0.4, mm(22));
  ctx.strokeStyle = mix(base, '#000000', 0.5);
  for (const y of art.seams) {
    ctx.beginPath();
    ctx.moveTo(-halfWidth, mm(y));
    ctx.lineTo(halfWidth, mm(y));
    ctx.stroke();
  }
  ctx.restore();

  // 8. Lights. Warm at the nose, red across the tail: you can tell a car's direction at a
  // glance in a mirror, and the same has to be true here.
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = 'rgba(255, 242, 219, 0.72)';
  const lamp = art.headlight;
  if (lamp.innerMm === 0) {
    ctx.fill(roundedRect(0, mm(lamp.y), mm(lamp.outerMm) * 2, mm(70), mm(20)));
  } else {
    for (const side of [-1, 1])
      ctx.fill(
        roundedRect(
          side * mm((lamp.innerMm + lamp.outerMm) / 2),
          mm(lamp.y),
          mm(lamp.outerMm - lamp.innerMm),
          mm(80),
          mm(30),
        ),
      );
  }
  // The full-width tail bar: on a real one it is the thing you recognise from behind, and
  // here it is what tells you instantly which way a car is pointing.
  ctx.fillStyle = 'rgba(255, 64, 72, 0.92)';
  ctx.fill(
    roundedRect(0, mm(art.taillight.y), mm(art.taillight.halfWidthMm) * 2, mm(85), mm(30)),
  );
  ctx.restore();

  // 9. Your own car wears a ring, so you can always find yourself.
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
