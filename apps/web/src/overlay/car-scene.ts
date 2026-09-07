import { colourOf, type TeslaModel } from '@teslawave/protocol';
import {
  MODEL_ART,
  halfWidthOf,
  mirroredPathData,
  pathData,
  type ModelArt,
  type Path,
} from './model-art';

/**
 * A car as a list of paint operations, in millimetres.
 *
 * The same list is rendered two ways: `ui/CarSvg.tsx` emits it as SVG for the picker, the
 * card and the toast, where a vector stays crisp at any size; `overlay/sprites.ts`
 * rasterises it once per (model, colour, dpr) for the map, where drawing an SVG per frame
 * would not survive an Intel Atom. One scene, two renderers, so the car on the map is the
 * car you chose.
 *
 * Everything here is flat colour, gradients and strokes: no blur, no filters, nothing that
 * cannot be baked (ADR-0014). Depth comes from where the light falls — a longitudinal paint
 * gradient, darker shoulders where the flanks roll away, a reflection band across the glass.
 */
export type Stop = readonly [offset: number, colour: string];
export type Paint =
  | string
  | { readonly kind: 'linear'; readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly stops: readonly Stop[] };

export type Op =
  | {
      readonly kind: 'fill';
      readonly d: string;
      readonly paint: Paint;
      readonly mirror?: boolean;
      readonly clip?: string;
      readonly alpha?: number;
      /** Drawn displaced by this much, in mm. */
      readonly offset?: readonly [number, number];
    }
  | {
      readonly kind: 'stroke';
      readonly d: string;
      readonly paint: Paint;
      readonly width: number;
      /** Rasterised no thinner than this, so a shut line survives a 40 px sprite. */
      readonly minPx?: number;
      readonly mirror?: boolean;
      readonly clip?: string;
      readonly alpha?: number;
      readonly cap?: 'round' | 'butt';
    };

export type Scene = {
  readonly model: TeslaModel;
  readonly lengthMm: number;
  /** Half of the drawn extent, mirrors included. */
  readonly halfWidthMm: number;
  readonly clips: Readonly<Record<string, string>>;
  readonly ops: readonly Op[];
};

const parse = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** `amount` of the way from `hex` toward `target`. */
export const mix = (hex: string, target: string, amount: number): string => {
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  return toHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
};

/** Perceived brightness, 0 to 1. */
export const luminance = (hex: string): number => {
  const [r, g, b] = parse(hex).map((v) => v / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

const rect = (x: number, y: number, w: number, h: number, r: number): string => {
  const rr = Math.min(r, w / 2, h / 2);
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  if (rr <= 0) return `M${x0} ${y0}h${w}v${h}h${-w}Z`;
  return (
    `M${x0 + rr} ${y0}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${h - 2 * rr}` +
    `a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(w - 2 * rr)}a${rr} ${rr} 0 0 1 ${-rr} ${-rr}` +
    `v${-(h - 2 * rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}Z`
  );
};

const GLASS_FRAME = '#0a0d12';
const TYRE = '#14171c';
const FLARE = '#1d2025';

/** The whole greenhouse: frame plus every panel, as one clip for the reflection band. */
const glassPanels = (art: ModelArt): Path[] => [
  art.windscreen,
  ...art.roofGlass,
  ...(art.rearGlass ? [art.rearGlass] : []),
];

export function buildCarScene(model: TeslaModel, colourId: string): Scene {
  const art = MODEL_ART[model];
  const base = colourOf(colourId).hex;
  const L = art.lengthMm;
  const half = L / 2;
  const bodyHalf = halfWidthOf(art.body);
  const wheelX = bodyHalf + art.wheels.proudMm - art.wheels.widthMm / 2;
  const dark = luminance(base) < 0.2;
  const light = luminance(base) > 0.7;
  const outline = mix(base, '#000000', light ? 0.5 : 0.62);
  const seam = rgba(mix(base, '#000000', 0.75), light ? 0.7 : 0.8);

  const body = mirroredPathData(art.body);
  const frame = mirroredPathData(art.frame);
  const panels = glassPanels(art).map(mirroredPathData);
  const windscreen = mirroredPathData(art.windscreen);
  // A strip either side straddling the body edge, for what only shows where the flank ends.
  const edge = bodyHalf - 70;
  const flanks = `M${edge} -${half}h110v${L}h-110Z M${-edge} -${half}h-110v${L}h110Z`;
  const clips: Record<string, string> = {
    body,
    frame,
    windscreen,
    flanks,
    // Every panel, both sides: the falcon glass is authored on one side only.
    glass:
      panels.join('') +
      (art.falconGlass ? pathData(art.falconGlass) + pathData(art.falconGlass, true) : ''),
  };

  const ops: Op[] = [];

  // 1. Contact shadow, displaced a little, so the car sits on the map instead of floating.
  ops.push({ kind: 'fill', d: body, paint: '#000000', alpha: 0.16, offset: [70, 110] });
  ops.push({ kind: 'fill', d: body, paint: '#000000', alpha: 0.2, offset: [35, 55] });

  // 2. Tyres, standing proud of the body at the corners.
  for (const axle of art.wheels.axles) {
    const tyre = rect(wheelX, axle, art.wheels.widthMm, art.wheels.lengthMm, art.angular ? 8 : 60);
    ops.push({ kind: 'fill', d: tyre, paint: TYRE, mirror: true });
    // The tread's shoulder catches a little light.
    ops.push({
      kind: 'stroke',
      d: rect(wheelX, axle, art.wheels.widthMm - 40, art.wheels.lengthMm - 40, art.angular ? 6 : 50),
      paint: '#353b46',
      width: 18,
      mirror: true,
    });
  }

  // 3. Paint. Lit from the nose, rolling away at the shoulders.
  ops.push({
    kind: 'fill',
    d: body,
    paint: {
      kind: 'linear',
      from: [0, -half],
      to: [0, half],
      stops: [
        [0, mix(base, '#ffffff', light ? 0.08 : 0.22)],
        [0.3, mix(base, '#ffffff', light ? 0.02 : 0.06)],
        [0.6, base],
        [1, mix(base, '#000000', 0.32)],
      ],
    },
  });
  ops.push({
    kind: 'fill',
    d: body,
    paint: {
      kind: 'linear',
      from: [-bodyHalf, 0],
      to: [bodyHalf, 0],
      stops: [
        [0, 'rgba(0,0,0,0.3)'],
        [0.15, 'rgba(0,0,0,0.04)'],
        [0.4, 'rgba(255,255,255,0.08)'],
        [0.6, 'rgba(255,255,255,0.08)'],
        [0.85, 'rgba(0,0,0,0.04)'],
        [1, 'rgba(0,0,0,0.3)'],
      ],
    },
  });
  // Where the flank rolls under: a wide inner stroke, clipped to the body so half of it shows.
  ops.push({
    kind: 'stroke',
    d: body,
    paint: 'rgba(0,0,0,0.22)',
    width: 150,
    clip: 'body',
  });
  // The wheel arches: the gap where the fender lip turns down over the tyre. From directly
  // above it is a dark line along the body edge with a tick at each end of the opening, and
  // it is what makes the corners read as wheels. Confined to the edge, or it would draw a
  // rectangle on the fender.
  for (const axle of art.wheels.axles)
    ops.push({
      kind: 'stroke',
      d: rect(wheelX, axle, art.wheels.widthMm + 20, art.wheels.lengthMm + 80, art.angular ? 12 : 80),
      paint: 'rgba(0,0,0,0.5)',
      width: 40,
      mirror: true,
      clip: 'flanks',
    });

  // 4. The bonnet, a panel of its own: the fender tops catch the light and the lid between
  // them sits a shade lower, rising again over the motor into a power dome down the middle.
  ops.push({
    kind: 'fill',
    d: mirroredPathData(art.frunk),
    paint: {
      kind: 'linear',
      from: [-bodyHalf, 0],
      to: [bodyHalf, 0],
      stops: [
        [0.05, 'rgba(0,0,0,0.16)'],
        [0.3, 'rgba(0,0,0,0.06)'],
        [0.5, light ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.1)'],
        [0.7, 'rgba(0,0,0,0.06)'],
        [0.95, 'rgba(0,0,0,0.16)'],
      ],
    },
  });
  ops.push({
    kind: 'stroke',
    d: pathData(art.frunk),
    paint: rgba(mix(base, '#ffffff', 0.6), light ? 0.35 : 0.16),
    width: 64,
    mirror: true,
    clip: 'body',
  });

  // Bonnet creases: a highlight and a shadow either side of each ridge.
  for (const crease of art.creases) {
    const d = pathData(crease);
    ops.push({ kind: 'stroke', d, paint: rgba(mix(base, '#ffffff', 0.5), light ? 0.55 : 0.28), width: 26, mirror: true, clip: 'body' });
    ops.push({ kind: 'stroke', d, paint: rgba(mix(base, '#000000', 0.55), 0.3), width: 22, mirror: true, clip: 'body', alpha: 1 });
  }

  // 5. Shut lines: frunk, boot, door cuts across the shoulder.
  ops.push({ kind: 'stroke', d: pathData(art.frunk), paint: seam, width: 18, minPx: 0.45, mirror: true, clip: 'body' });
  if (art.boot)
    ops.push({ kind: 'stroke', d: pathData(art.boot), paint: seam, width: 18, minPx: 0.45, mirror: true, clip: 'body' });
  for (const y of art.doorCuts)
    ops.push({
      kind: 'stroke',
      d: `M${halfWidthOf(art.frame) - 30} ${y}L${bodyHalf + 20} ${y}`,
      paint: seam,
      width: 16,
      mirror: true,
      clip: 'body',
      alpha: 0.7,
    });

  // The Cybertruck's flares: bare composite, matte, over each wheel.
  for (const flare of art.flares ?? []) {
    const d = pathData(flare);
    ops.push({ kind: 'fill', d, paint: FLARE, mirror: true, clip: 'body' });
    ops.push({ kind: 'stroke', d, paint: 'rgba(255,255,255,0.09)', width: 24, mirror: true, clip: 'body' });
  }

  // 6. The greenhouse frame: pillars, rails and the side glass seen edge-on.
  ops.push({
    kind: 'fill',
    d: frame,
    paint: {
      kind: 'linear',
      from: [-bodyHalf, 0],
      to: [bodyHalf, 0],
      stops: [
        [0.08, '#2a3646'],
        [0.22, '#151c25'],
        [0.34, GLASS_FRAME],
        [0.66, GLASS_FRAME],
        [0.78, '#151c25'],
        [0.92, '#2a3646'],
      ],
    },
  });

  // The A-pillar and roof rail, seen from above, are painted: one line of body colour down
  // each side between the glass and the side glass seen edge-on, drawn under the panels so
  // half its width shows. Without it the greenhouse is a black slab wider than the roof,
  // which no car has.
  const roofPaint = mix(base, '#000000', light ? 0.3 : 0.4);
  ops.push({
    kind: 'stroke',
    d: pathData(art.rail),
    paint: roofPaint,
    width: 90,
    mirror: true,
    clip: 'frame',
    cap: 'round',
  });

  // Roof that is painted, not glass: the Y's strip behind its roof panel, the X's beam and
  // spine. Body colour, a shade down for the angle it sits at.
  for (const panel of art.roofPaint ?? [])
    ops.push({ kind: 'fill', d: mirroredPathData(panel), paint: roofPaint, clip: 'frame' });

  // 7. Glass. The windscreen is the most raked and reflects the most sky; the roof is darkest.
  ops.push({
    kind: 'fill',
    d: windscreen,
    paint: {
      kind: 'linear',
      from: [0, art.windscreen.start[1]],
      to: [0, art.windscreen.segs.at(-1)?.to[1] ?? 0],
      stops: [
        [0, '#5b7694'],
        [0.5, '#34475e'],
        [1, '#22303f'],
      ],
    },
  });
  for (const panel of art.roofGlass)
    ops.push({
      kind: 'fill',
      d: mirroredPathData(panel),
      paint: {
        kind: 'linear',
        from: [0, panel.start[1]],
        to: [0, panel.segs.at(-1)?.to[1] ?? 0],
        stops: [
          [0, '#243244'],
          [1, '#182230'],
        ],
      },
    });
  if (art.falconGlass)
    ops.push({
      kind: 'fill',
      d: pathData(art.falconGlass),
      paint: {
        kind: 'linear',
        from: [0, -100],
        to: [0, 1400],
        stops: [
          [0, '#2a3a4d'],
          [1, '#1a2431'],
        ],
      },
      mirror: true,
    });
  if (art.rearGlass)
    ops.push({
      kind: 'fill',
      d: mirroredPathData(art.rearGlass),
      paint: {
        kind: 'linear',
        from: [0, art.rearGlass.start[1]],
        to: [0, art.rearGlass.segs.at(-1)?.to[1] ?? 0],
        stops: [
          [0, '#1f2b3a'],
          [1, '#33465d'],
        ],
      },
    });
  // The wipers, parked on the glass, and the camera housing behind the mirror at the top of
  // the screen: the two things on a Tesla's windscreen that show from above.
  for (const arm of art.wipers)
    ops.push({ kind: 'stroke', d: pathData(arm), paint: '#0b0e13', width: 30, alpha: 0.9, clip: 'windscreen', cap: 'round' });
  const screenTop = art.windscreen.segs.at(-1)?.to[1] ?? 0;
  ops.push({
    kind: 'fill',
    d: `M-135 ${screenTop - 240}L135 ${screenTop - 240}L95 ${screenTop - 40}L-95 ${screenTop - 40}Z`,
    paint: '#0d1116',
    alpha: 0.9,
    clip: 'windscreen',
  });
  // The reflection: one band of sky across every panel, the cue that says "glass".
  ops.push({
    kind: 'fill',
    d: body,
    clip: 'glass',
    paint: {
      kind: 'linear',
      from: [-bodyHalf, -half * 0.55],
      to: [bodyHalf, half * 0.35],
      stops: [
        [0, 'rgba(255,255,255,0)'],
        [0.36, 'rgba(255,255,255,0)'],
        [0.44, 'rgba(255,255,255,0.13)'],
        [0.56, 'rgba(255,255,255,0.13)'],
        [0.64, 'rgba(255,255,255,0)'],
        [1, 'rgba(255,255,255,0)'],
      ],
    },
  });
  // The Model 3's roof bar, across the frame between the two panels: matte black steel, so it
  // reads against glass that is reflecting sky, whatever colour the car is.
  if (art.roofBar)
    ops.push({
      kind: 'fill',
      d: rect(0, art.roofBar.y, bodyHalf * 2, art.roofBar.heightMm, 0),
      paint: '#2c3440',
      clip: 'frame',
    });
  // The Model X's spine between the falcon windows, and its door seams into the roof.
  if (art.falconGlass) {
    ops.push({
      kind: 'stroke',
      d: pathData(art.falconGlass),
      paint: 'rgba(160,184,214,0.28)',
      width: 16,
      mirror: true,
    });
  }
  // The Cybertruck's vault: a ribbed tonneau, a shade off the stainless around it.
  if (art.vault) {
    const vault = mirroredPathData(art.vault);
    ops.push({ kind: 'fill', d: vault, paint: mix(base, '#000000', 0.72) });
    const top = art.vault.start[1];
    const bottom = art.vault.segs.at(-1)?.to[1] ?? top;
    for (let y = top + 150; y < bottom; y += 150)
      ops.push({ kind: 'stroke', d: `M-900 ${y}L900 ${y}`, paint: 'rgba(255,255,255,0.05)', width: 30, clip: 'vault' });
    ops.push({ kind: 'stroke', d: vault, paint: 'rgba(0,0,0,0.5)', width: 20, minPx: 0.5 });
    clips['vault'] = vault;
  }

  // 8. Mirrors, in paint, hung off the shoulder, with a shadow so they stand off it.
  ops.push({ kind: 'fill', d: pathData(art.mirror), paint: '#000000', alpha: 0.28, offset: [30, 60], mirror: true, clip: 'body' });
  ops.push({
    kind: 'fill',
    d: pathData(art.mirror),
    paint: {
      kind: 'linear',
      from: [0, art.mirror.start[1] - 120],
      to: [0, art.mirror.start[1] + 120],
      stops: [
        [0, mix(base, '#ffffff', light ? 0.04 : 0.12)],
        [1, mix(base, '#000000', 0.4)],
      ],
    },
    mirror: true,
  });
  ops.push({ kind: 'stroke', d: pathData(art.mirror), paint: outline, width: 16, minPx: 0.4, mirror: true });

  // 9. Lights. Warm-white at the nose, red at the tail: which way a car points is never in doubt.
  const head = pathData(art.headlight.path);
  ops.push({ kind: 'stroke', d: head, paint: 'rgba(10,14,20,0.55)', width: art.headlight.widthMm + 50, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: 'rgba(150,200,255,0.3)', width: art.headlight.widthMm + 24, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: '#e6f1ff', width: art.headlight.widthMm, minPx: 0.9, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: '#ffffff', width: art.headlight.widthMm * 0.4, mirror: true, clip: 'body', cap: 'round' });
  const tail = pathData(art.taillight.path);
  ops.push({ kind: 'stroke', d: tail, paint: 'rgba(10,14,20,0.55)', width: art.taillight.widthMm + 50, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: 'rgba(255,60,60,0.3)', width: art.taillight.widthMm + 24, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: '#ff3a3f', width: art.taillight.widthMm, minPx: 0.9, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: '#ff9a9a', width: art.taillight.widthMm * 0.35, mirror: true, clip: 'body', cap: 'round' });

  // 10. Outline, and a rim light for paint that would otherwise vanish into a dark map.
  ops.push({ kind: 'stroke', d: body, paint: outline, width: 24, minPx: 0.7 });
  if (dark) {
    const rim = Math.max(0, 0.5 - luminance(base)) * 0.9;
    ops.push({ kind: 'stroke', d: body, paint: `rgba(190,214,240,${rim.toFixed(3)})`, width: 60, minPx: 1, clip: 'body' });
  }

  return {
    model,
    lengthMm: L,
    halfWidthMm: halfWidthOf(art.mirror),
    clips,
    ops,
  };
}
