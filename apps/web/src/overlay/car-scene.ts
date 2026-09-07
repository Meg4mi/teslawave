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
 *
 * Detail is drawn to the size it will be seen at. The marks that make the hero a portrait
 * of the right car — wipers, creases, door cuts, wheel arches — are flagged `fine`, and a
 * renderer drops them below `FINE_DETAIL_PX`, where they would only be specks on the paint.
 */
export type Stop = readonly [offset: number, colour: string];

/**
 * Below this length on screen the fine detail — wipers, creases, door cuts, the arches —
 * is skipped. At 58 px a wiper is a smudge on the glass and a door cut a speck on the
 * flank; the car reads better as clean paint and clean glass, which is also how Tesla draws
 * its own cars. At hero size the same marks are what make it a photograph of the right car.
 */
export const FINE_DETAIL_PX = 150;

/** Whether a car drawn this long, in CSS pixels, should carry its fine detail. */
export const showsFineDetail = (lengthPx: number): boolean => lengthPx >= FINE_DETAIL_PX;
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
      /** Only drawn when the car is at least `FINE_DETAIL_PX` long. */
      readonly fine?: boolean;
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
      /** Only drawn when the car is at least `FINE_DETAIL_PX` long. */
      readonly fine?: boolean;
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
    frunk: mirroredPathData(art.frunk),
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
      paint: '#3b424d',
      width: 22,
      mirror: true,
    });
  }

  // 3. Paint. Lit from the nose, rolling away at the shoulders.
  const bodyStops: Stop[] = [
    [0, mix(base, '#ffffff', light ? 0.06 : 0.2)],
    [0.3, mix(base, '#ffffff', light ? 0.02 : 0.06)],
    [0.6, base],
    [1, mix(base, '#000000', 0.3)],
  ];
  ops.push({ kind: 'fill', d: body, paint: { kind: 'linear', from: [0, -half], to: [0, half], stops: bodyStops } });
  ops.push({
    kind: 'fill',
    d: body,
    paint: {
      kind: 'linear',
      from: [-bodyHalf, 0],
      to: [bodyHalf, 0],
      stops: [
        [0, 'rgba(0,0,0,0.34)'],
        [0.12, 'rgba(0,0,0,0.08)'],
        [0.3, 'rgba(255,255,255,0.05)'],
        [0.5, 'rgba(255,255,255,0.08)'],
        [0.7, 'rgba(255,255,255,0.05)'],
        [0.88, 'rgba(0,0,0,0.08)'],
        [1, 'rgba(0,0,0,0.34)'],
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
      paint: 'rgba(0,0,0,0.32)',
      width: 30,
      mirror: true,
      clip: 'flanks',
      fine: true,
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
        [0.05, 'rgba(0,0,0,0.2)'],
        [0.28, 'rgba(0,0,0,0.07)'],
        [0.5, light ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.12)'],
        [0.72, 'rgba(0,0,0,0.07)'],
        [0.95, 'rgba(0,0,0,0.2)'],
      ],
    },
  });
  // The fender top just outside the shut line catches the light; the lid just inside it sits
  // in its shadow. Two half-strokes along the same line.
  ops.push({
    kind: 'stroke',
    d: pathData(art.frunk),
    paint: rgba(mix(base, '#ffffff', 0.6), light ? 0.3 : 0.14),
    width: 56,
    mirror: true,
    clip: 'body',
  });
  ops.push({
    kind: 'stroke',
    d: pathData(art.frunk),
    paint: 'rgba(0,0,0,0.1)',
    width: 50,
    mirror: true,
    clip: 'frunk',
  });

  // Bonnet creases: a highlight and a shadow either side of each ridge.
  for (const crease of art.creases) {
    const d = pathData(crease);
    ops.push({ kind: 'stroke', d, paint: rgba(mix(base, '#ffffff', 0.5), light ? 0.45 : 0.24), width: 26, mirror: true, clip: 'frunk', fine: true });
    ops.push({ kind: 'stroke', d, paint: rgba(mix(base, '#000000', 0.55), light ? 0.18 : 0.26), width: 22, mirror: true, clip: 'frunk', fine: true });
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
      fine: true,
    });

  // The Cybertruck's flares: bare composite, matte, over each wheel.
  for (const flare of art.flares ?? []) {
    const d = pathData(flare);
    ops.push({ kind: 'fill', d, paint: FLARE, mirror: true, clip: 'body' });
    ops.push({ kind: 'stroke', d, paint: 'rgba(255,255,255,0.09)', width: 24, mirror: true, clip: 'body' });
  }

  // 6. The shoulder. The roof stands above it, so it lies in a thin shadow next to the
  // glass, and beyond that its crown catches the light before the flank rolls away. Both
  // are strokes along the frame's outline, drawn before the frame so only the outer half
  // shows.
  if (!light)
    ops.push({ kind: 'stroke', d: frame, paint: 'rgba(255,255,255,0.06)', width: 260, clip: 'body' });
  ops.push({ kind: 'stroke', d: frame, paint: 'rgba(0,0,0,0.22)', width: 70, clip: 'body' });

  // The greenhouse frame: pillars, rails and the side glass seen edge-on, nearly black in
  // the middle and rolling up to a blue-grey at its outer edge, where the top of the door
  // glass catches the sky. A gradient, not a line: the edge is a curve, not a seam.
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

  // Roof that is painted, not glass, is the same panel as the bonnet and lit the same way:
  // the body's own gradient, a shade down for the angle it sits at. The A-pillar and roof
  // rail are one thin line of it down each side between the glass and the edge-on side
  // glass; the Y's strip behind its roof panel, the X's beam and spine, and the 3's cross bar
  // are panels of it.
  const roofPaint = mix(base, '#000000', light ? 0.27 : 0.34);
  const roofGradient: Paint = {
    kind: 'linear',
    from: [0, -half],
    to: [0, half],
    stops: bodyStops.map(([offset, colour]) => [offset, mix(colour, '#000000', light ? 0.16 : 0.26)]),
  };
  ops.push({
    kind: 'stroke',
    d: pathData(art.rail),
    paint: roofPaint,
    width: 44,
    minPx: 0.6,
    mirror: true,
    clip: 'frame',
    cap: 'round',
  });
  for (const panel of art.roofPaint ?? [])
    ops.push({ kind: 'fill', d: mirroredPathData(panel), paint: roofGradient, clip: 'frame' });

  // 7. Glass. The windscreen is the most raked and reflects the most sky; the roof is darkest.
  ops.push({
    kind: 'fill',
    d: windscreen,
    paint: {
      kind: 'linear',
      from: [0, art.windscreen.start[1]],
      to: [0, art.windscreen.segs.at(-1)?.to[1] ?? 0],
      stops: [
        [0, '#6f8aa8'],
        [0.45, '#3a4e66'],
        [1, '#232f3e'],
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
          [0, '#1f2b3b'],
          [1, '#151d29'],
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
          [0, '#243447'],
          [1, '#182230'],
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
          [0, '#1c2735'],
          [1, '#3b5069'],
        ],
      },
    });
  // The wipers, parked on the glass, and the camera housing behind the mirror at the top of
  // the screen: the two things on a Tesla's windscreen that show from above.
  for (const arm of art.wipers)
    ops.push({ kind: 'stroke', d: pathData(arm), paint: '#0b0e13', width: 22, alpha: 0.6, clip: 'windscreen', cap: 'round', fine: true });
  const screenTop = art.windscreen.segs.at(-1)?.to[1] ?? 0;
  ops.push({
    kind: 'fill',
    d: `M-90 ${screenTop - 190}L90 ${screenTop - 190}L58 ${screenTop - 50}L-58 ${screenTop - 50}Z`,
    paint: '#0d1116',
    alpha: 0.7,
    clip: 'windscreen',
    fine: true,
  });
  // The reflection: one soft band of sky across every panel, and a thin bright streak along
  // its leading edge. The cue that says "glass".
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
        [0.3, 'rgba(255,255,255,0)'],
        [0.42, 'rgba(255,255,255,0.12)'],
        [0.56, 'rgba(255,255,255,0.12)'],
        [0.68, 'rgba(255,255,255,0)'],
        [1, 'rgba(255,255,255,0)'],
      ],
    },
  });
  ops.push({
    kind: 'fill',
    d: body,
    clip: 'glass',
    paint: {
      kind: 'linear',
      from: [-bodyHalf, -half * 0.55],
      to: [bodyHalf, half * 0.35],
      stops: [
        [0.395, 'rgba(255,255,255,0)'],
        [0.405, 'rgba(255,255,255,0.16)'],
        [0.425, 'rgba(255,255,255,0.16)'],
        [0.435, 'rgba(255,255,255,0)'],
      ],
    },
  });
  // The Model 3's roof bar, across the frame between the two panels: painted, like the roof
  // rails it joins, so the roof reads as two panes of glass in one body-coloured frame.
  if (art.roofBar)
    ops.push({
      kind: 'fill',
      d: rect(0, art.roofBar.y, bodyHalf * 2, art.roofBar.heightMm, 0),
      paint: roofGradient,
      clip: 'frame',
    });
  // The Model X's door seams into the roof, either side of the spine.
  if (art.falconGlass) {
    ops.push({
      kind: 'stroke',
      d: pathData(art.falconGlass),
      paint: 'rgba(160,184,214,0.28)',
      width: 16,
      mirror: true,
      fine: true,
    });
  }
  // The Cybertruck's vault: a ribbed tonneau, a shade off the stainless around it.
  if (art.vault) {
    const vault = mirroredPathData(art.vault);
    // On black paint the tonneau would vanish, so it never goes darker than its own grey.
    ops.push({ kind: 'fill', d: vault, paint: dark ? '#111418' : mix(base, '#000000', 0.72) });
    const top = art.vault.start[1];
    const bottom = art.vault.segs.at(-1)?.to[1] ?? top;
    for (let y = top + 150; y < bottom; y += 150)
      ops.push({ kind: 'stroke', d: `M-900 ${y}L900 ${y}`, paint: 'rgba(255,255,255,0.07)', width: 30, clip: 'vault', fine: true });
    ops.push({ kind: 'stroke', d: vault, paint: 'rgba(0,0,0,0.5)', width: 20, minPx: 0.5 });
    clips['vault'] = vault;
  }

  // 8. Mirrors, in paint, hung off the shoulder, with a shadow so they stand off it. The
  // cap is body colour and lit from the front; the back third is the glass, dark.
  const mirrorY = art.mirror.start[1];
  ops.push({ kind: 'fill', d: pathData(art.mirror), paint: '#000000', alpha: 0.3, offset: [30, 60], mirror: true, clip: 'body', fine: true });
  ops.push({
    kind: 'fill',
    d: pathData(art.mirror),
    paint: {
      kind: 'linear',
      from: [0, mirrorY],
      to: [0, mirrorY + 220],
      stops: [
        [0, mix(base, '#ffffff', light ? 0.05 : 0.16)],
        [0.55, mix(base, '#000000', 0.25)],
        [0.72, '#101317'],
        [1, '#101317'],
      ],
    },
    mirror: true,
  });
  ops.push({ kind: 'stroke', d: pathData(art.mirror), paint: outline, width: 16, minPx: 0.4, mirror: true });

  // 9. Lights. Warm-white at the nose, red at the tail: which way a car points is never in
  // doubt. A dark housing, a soft glow spilling onto the paint, the lamp, and a bright core.
  const head = pathData(art.headlight.path);
  ops.push({ kind: 'stroke', d: head, paint: 'rgba(8,11,16,0.5)', width: art.headlight.widthMm + 40, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: 'rgba(150,200,255,0.3)', width: art.headlight.widthMm + 24, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: '#e6f1ff', width: art.headlight.widthMm, minPx: 0.9, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: head, paint: '#ffffff', width: art.headlight.widthMm * 0.4, mirror: true, clip: 'body', cap: 'round' });
  const tail = pathData(art.taillight.path);
  ops.push({ kind: 'stroke', d: tail, paint: 'rgba(8,11,16,0.5)', width: art.taillight.widthMm + 40, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: 'rgba(255,60,60,0.3)', width: art.taillight.widthMm + 24, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: '#ff3a3f', width: art.taillight.widthMm, minPx: 0.9, mirror: true, clip: 'body', cap: 'round' });
  ops.push({ kind: 'stroke', d: tail, paint: '#ff9a9a', width: art.taillight.widthMm * 0.35, mirror: true, clip: 'body', cap: 'round' });

  // 10. Outline, and a rim light for paint that would otherwise vanish into a dark map.
  ops.push({ kind: 'stroke', d: body, paint: outline, width: 24, minPx: 0.7 });
  if (dark) {
    const rim = Math.max(0, 0.5 - luminance(base)) * 0.8;
    ops.push({ kind: 'stroke', d: body, paint: `rgba(190,214,240,${rim.toFixed(3)})`, width: 50, minPx: 1, clip: 'body' });
  }

  return {
    model,
    lengthMm: L,
    halfWidthMm: halfWidthOf(art.mirror),
    clips,
    ops,
  };
}
