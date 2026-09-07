import { describe, expect, it } from 'vitest';
import { TESLA_MODELS, type TeslaModel } from '@teslawave/protocol';
import {
  MODEL_ART,
  endOf,
  mirroredPathData,
  pathData,
  samplePoints,
  type ModelArt,
  type Path,
  type Pt,
} from './model-art';
import { FINE_DETAIL_PX, buildCarScene, showsFineDetail } from './car-scene';

/**
 * Hand-authored geometry has no compiler. These are the checks that stand in for one: the
 * proportions must match the real cars, the curves must meet their own mirror image without a
 * crease, every panel must sit inside the body, and no two models may come out as the same
 * shape — which is exactly what the old parametric sprites did.
 */
const art = (model: TeslaModel): ModelArt => MODEL_ART[model];

const extentX = (path: Path): number =>
  samplePoints(path).reduce((max, [x]) => Math.max(max, Math.abs(x)), 0);

const extentY = (path: Path): { front: number; rear: number } =>
  samplePoints(path).reduce(
    (acc, [, y]) => ({ front: Math.min(acc.front, y), rear: Math.max(acc.rear, y) }),
    { front: Infinity, rear: -Infinity },
  );

/** Everything authored as a right-hand half and closed by its mirror image. */
const halves = (spec: ModelArt): Path[] => [
  spec.body,
  spec.frame,
  spec.windscreen,
  ...spec.roofGlass,
  ...(spec.rearGlass ? [spec.rearGlass] : []),
  ...(spec.vault ? [spec.vault] : []),
];

describe('model art', () => {
  it('covers every model on the wire', () => {
    expect(Object.keys(MODEL_ART).sort()).toEqual([...TESLA_MODELS].sort());
  });

  for (const model of TESLA_MODELS) {
    describe(`Model ${model}`, () => {
      const spec = art(model);

      it('is as long and as wide as the real car', () => {
        const { front, rear } = extentY(spec.body);
        expect(rear - front).toBeCloseTo(spec.lengthMm, -1);
        // Within 10 mm: the widest point is the published width, over the rear haunches.
        expect(extentX(spec.body) * 2).toBeGreaterThan(spec.widthMm - 20);
        expect(extentX(spec.body) * 2).toBeLessThanOrEqual(spec.widthMm + 2);
      });

      it('puts its wheels where the wheelbase says', () => {
        const [front, rear] = spec.wheels.axles;
        expect(rear - front).toBeCloseTo(spec.wheelbaseMm, -1);
        // Measured from the nose, the front axle sits at the published front overhang.
        expect(front + spec.lengthMm / 2).toBeCloseTo(spec.frontOverhangMm, -1);
      });

      it('meets its own mirror image without a crease', () => {
        for (const half of halves(spec)) {
          expect(half.start[0]).toBe(0);
          expect(endOf(half)[0]).toBe(0);
          // A horizontal tangent at each end, or the join shows as a point down the centre.
          expect(half.segs[0]?.c1[1]).toBe(half.start[1]);
          const last = half.segs.at(-1);
          expect(last?.c2[1]).toBe(last?.to[1]);
        }
      });

      it('ends its shut lines on the centreline', () => {
        for (const seam of [spec.frunk, ...(spec.boot ? [spec.boot] : [])]) {
          expect(endOf(seam)[0]).toBe(0);
          expect(seam.start[0]).toBeGreaterThan(spec.widthMm * 0.4);
        }
      });

      it('keeps the glass inside the body, and the panels inside the frame', () => {
        expect(extentX(spec.frame)).toBeLessThan(extentX(spec.body));
        const body = extentY(spec.body);
        const frame = extentY(spec.frame);
        expect(frame.front).toBeGreaterThan(body.front);
        expect(frame.rear).toBeLessThan(body.rear);
        for (const panel of [spec.windscreen, ...spec.roofGlass, ...(spec.rearGlass ? [spec.rearGlass] : [])]) {
          expect(extentX(panel)).toBeLessThan(extentX(spec.frame));
          const p = extentY(panel);
          expect(p.front).toBeGreaterThanOrEqual(frame.front);
          expect(p.rear).toBeLessThanOrEqual(frame.rear);
        }
        if (spec.falconGlass) expect(extentX(spec.falconGlass)).toBeLessThan(extentX(spec.frame));
      });

      it('keeps its wheels, mirrors and lights on the car', () => {
        for (const axle of spec.wheels.axles)
          expect(Math.abs(axle) + spec.wheels.lengthMm / 2).toBeLessThan(spec.lengthMm / 2);
        expect(extentY(spec.headlight.path).rear).toBeLessThan(spec.wheels.axles[0]);
        expect(extentY(spec.taillight.path).front).toBeGreaterThan(spec.wheels.axles[1]);
        expect(extentX(spec.taillight.path)).toBeLessThan(spec.widthMm / 2);
        // The mirror hangs off the shoulder, just behind the windscreen's base.
        expect(extentX(spec.mirror)).toBeGreaterThan(extentX(spec.body));
        expect(extentY(spec.mirror).front).toBeGreaterThan(extentY(spec.frame).front);
        for (const y of spec.doorCuts) expect(Math.abs(y)).toBeLessThan(spec.lengthMm / 2 - 500);
      });

      it('runs a painted rail down each side of the glass, inside the frame', () => {
        expect(spec.rail.start[0]).toBeGreaterThan(spec.widthMm * 0.2);
        expect(endOf(spec.rail)[0]).toBeGreaterThan(100);
        expect(extentX(spec.rail)).toBeLessThan(extentX(spec.frame));
        const frame = extentY(spec.frame);
        const rail = extentY(spec.rail);
        expect(rail.front).toBeGreaterThan(frame.front);
        expect(rail.rear).toBeLessThan(frame.rear);
      });

      it('parks its wipers on the windscreen, driver on the left', () => {
        // Authored whole, not mirrored: a left-hand-drive car's wipers are not symmetric.
        expect(spec.wipers.length).toBeGreaterThan(0);
        const screen = extentY(spec.windscreen);
        const halfW = extentX(spec.windscreen);
        for (const arm of spec.wipers) {
          const y = extentY(arm);
          expect(y.front).toBeGreaterThan(screen.front);
          expect(y.rear).toBeLessThan(screen.rear);
          // Along the base of the glass, not across the middle of it — except the
          // Cybertruck's, which parks standing up the driver's side.
          if (!spec.angular) expect(y.rear).toBeLessThan(screen.front + (screen.rear - screen.front) * 0.4);
          expect(extentX(arm)).toBeLessThan(halfW + 60);
        }
        expect(Math.min(...spec.wipers.flatMap((arm) => samplePoints(arm).map(([x]) => x)))).toBeLessThan(-200);
      });

      it('builds a scene both renderers can draw', () => {
        const scene = buildCarScene(model, 'pearl');
        expect(scene.ops.length).toBeGreaterThan(20);
        // The wipers are cut to the glass, the arches to the body's edge.
        expect(scene.clips['windscreen']).toBeDefined();
        expect(scene.clips['flanks']).toBeDefined();
        for (const op of scene.ops) {
          expect(op.d).toMatch(/^M-?\d/);
          if (op.clip) expect(scene.clips[op.clip]).toBeDefined();
        }
      });

      it('keeps the car whole without its fine detail', () => {
        // A map sprite skips the wipers, creases and door cuts; what is left must still be
        // paint, glass, lamps and an outline, not a car missing a panel.
        const scene = buildCarScene(model, 'pearl');
        const fine = scene.ops.filter((op) => op.fine);
        const coarse = scene.ops.filter((op) => !op.fine);
        expect(fine.length).toBeGreaterThan(3);
        expect(coarse.length).toBeGreaterThan(20);
        expect(coarse.some((op) => op.kind === 'fill' && op.d === scene.clips['body'])).toBe(true);
        expect(coarse.some((op) => op.kind === 'fill' && op.clip === 'glass')).toBe(true);
        expect(coarse.some((op) => op.paint === '#ff3a3f')).toBe(true);
        for (const arm of spec.wipers) expect(fine.some((op) => op.d === pathData(arm))).toBe(true);
      });
    });
  }

  it('draws fine detail on the hero and not on the map', () => {
    expect(showsFineDetail(58)).toBe(false);
    expect(showsFineDetail(FINE_DETAIL_PX)).toBe(true);
    expect(showsFineDetail(560)).toBe(true);
  });

  it('gives the Model 3 a roof bar and two panels, and the Model Y one uninterrupted panel', () => {
    // The clearest way to tell apart the two most common cars on the road, from above.
    expect(art('3').roofBar).toBeDefined();
    expect(art('3').roofGlass).toHaveLength(2);
    expect(art('Y').roofBar).toBeUndefined();
    expect(art('Y').roofGlass).toHaveLength(1);
  });

  it('runs the Model Y glass back to the tailgate and stops the 3 at the boot', () => {
    const y = extentY(art('Y').frame).rear / art('Y').lengthMm;
    const three = extentY(art('3').frame).rear / art('3').lengthMm;
    expect(y).toBeGreaterThan(three + 0.05);
  });

  it('gives the Model S the longest bonnet and the Model X the shortest', () => {
    const bonnet = (model: TeslaModel): number => {
      const spec = art(model);
      return (extentY(spec.frame).front - extentY(spec.body).front) / spec.lengthMm;
    };
    // The X's panoramic windscreen starts near the front axle; the S has a bonnet to spare.
    expect(bonnet('S')).toBeGreaterThan(bonnet('3'));
    expect(bonnet('X')).toBeLessThan(bonnet('3'));
    expect(bonnet('X')).toBeLessThan(bonnet('Y'));
  });

  it('paints part of the roof on the Y and the X, and keeps every painted panel in the frame', () => {
    expect(art('Y').roofPaint?.length).toBe(1);
    expect(art('X').roofPaint?.length).toBe(3);
    for (const model of ['3', 'S', 'CT'] as const) expect(art(model).roofPaint).toBeUndefined();
    for (const model of TESLA_MODELS)
      for (const panel of art(model).roofPaint ?? []) {
        const frame = extentY(art(model).frame);
        expect(extentY(panel).front).toBeGreaterThan(frame.front);
        expect(extentY(panel).rear).toBeLessThan(frame.rear);
      }
  });

  it('gives the Model X falcon-wing roof glass and nothing else', () => {
    for (const model of TESLA_MODELS)
      expect(art(model).falconGlass === undefined).toBe(model !== 'X');
  });

  it('gives the Cybertruck flares that stand proud of its doors, and nobody else any', () => {
    for (const model of TESLA_MODELS) expect(art(model).flares !== undefined).toBe(model === 'CT');
    const spec = art('CT');
    const doorHalf = samplePoints(spec.body).filter(([, y]) => Math.abs(y) < 1000).reduce((m, [x]) => Math.max(m, x), 0);
    for (const flare of spec.flares ?? []) {
      expect(extentX(flare)).toBeGreaterThan(doorHalf + 50);
      expect(extentX(flare)).toBeLessThanOrEqual(spec.widthMm / 2 + 1);
      // Over a wheel: the flare spans the axle.
      const { front, rear } = extentY(flare);
      expect(spec.wheels.axles.some((axle) => axle > front && axle < rear)).toBe(true);
    }
  });

  it('builds the Cybertruck out of straight lines', () => {
    const spec = art('CT');
    expect(spec.angular).toBe(true);
    expect(spec.vault).toBeDefined();
    // Every control point of a straight segment lies on its own chord.
    let from = spec.body.start;
    for (const seg of spec.body.segs) {
      for (const control of [seg.c1, seg.c2]) {
        const cross =
          (seg.to[0] - from[0]) * (control[1] - from[1]) -
          (seg.to[1] - from[1]) * (control[0] - from[0]);
        expect(Math.abs(cross)).toBeLessThan(1);
      }
      from = seg.to;
    }
  });

  it('emits SVG path data that closes where it should', () => {
    const body = mirroredPathData(art('3').body);
    expect(body.startsWith('M0 -2360')).toBe(true);
    expect(body.endsWith('Z')).toBe(true);
    expect(pathData(art('3').frunk).endsWith('Z')).toBe(false);
    // The mirrored copy negates x and nothing else.
    expect(pathData(art('3').mirror, true)).toContain('M-');
  });

  it('draws five cars, not one car five times', () => {
    /*
     * Silhouette signature: the half-width of the body and of the greenhouse at twelve
     * stations down the car, as a percentage of its length. Length is divided out on purpose:
     * two models that differ only in scale should still fail this.
     */
    const signature = (model: TeslaModel): number[] => {
      const spec = art(model);
      const body = samplePoints(spec.body, 24);
      const glass = samplePoints(spec.frame, 24);
      const at = (points: readonly Pt[], y: number): number => {
        const near = points.reduce((best, p) =>
          Math.abs(p[1] - y) < Math.abs(best[1] - y) ? p : best,
        );
        // Nothing there: past the end of the greenhouse, say.
        if (Math.abs(near[1] - y) > spec.lengthMm * 0.06) return 0;
        return Math.round((Math.abs(near[0]) / spec.lengthMm) * 100);
      };
      return Array.from({ length: 12 }, (_, i) => {
        const y = (-0.46 + (i / 11) * 0.92) * spec.lengthMm;
        return [at(body, y), at(glass, y)];
      }).flat();
    };

    const signatures = new Map(TESLA_MODELS.map((model) => [model, signature(model)]));
    for (const a of TESLA_MODELS)
      for (const b of TESLA_MODELS) {
        if (a >= b) continue;
        const [sa, sb] = [signatures.get(a) ?? [], signatures.get(b) ?? []];
        const distance = sa.reduce((sum, v, i) => sum + Math.abs(v - (sb[i] ?? 0)), 0);
        // The closest pair is the two SUVs — a Model X and a Model Y really are similar
        // objects, and what separates them is where the windscreen starts. Anything under 10
        // is two drawings of the same car, which is the failure this module exists to prevent.
        expect(distance, `${a} vs ${b}`).toBeGreaterThan(10);
      }
  });
});
