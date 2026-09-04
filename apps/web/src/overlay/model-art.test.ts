import { describe, expect, it } from 'vitest';
import { TESLA_MODELS, type TeslaModel } from '@teslawave/protocol';
import { MODEL_ART, endOf, samplePoints, type Half, type ModelArt, type Pt } from './model-art';

/**
 * Hand-traced geometry has no compiler. These are the checks that stand in for one: the
 * proportions must match the real cars, the curves must meet their own mirror image without a
 * crease, and no two models may come out as the same shape — which is exactly what the old
 * parametric sprites did.
 */
const art = (model: TeslaModel): ModelArt => MODEL_ART[model];

const extentX = (half: Half): number =>
  samplePoints(half).reduce((max, [x]) => Math.max(max, Math.abs(x)), 0);

const extentY = (half: Half): { front: number; rear: number } =>
  samplePoints(half).reduce(
    (acc, [, y]) => ({ front: Math.min(acc.front, y), rear: Math.max(acc.rear, y) }),
    { front: Infinity, rear: -Infinity },
  );

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
        for (const half of [spec.body, spec.glass, ...(spec.vault ? [spec.vault] : [])]) {
          expect(half.start[0]).toBe(0);
          expect(endOf(half)[0]).toBe(0);
          // A horizontal tangent at each end, or the join shows as a point down the centre.
          expect(half.segs[0]?.c1[1]).toBe(half.start[1]);
          const last = half.segs.at(-1);
          expect(last?.c2[1]).toBe(last?.to[1]);
        }
      });

      it('keeps the glass inside the body', () => {
        expect(extentX(spec.glass)).toBeLessThan(extentX(spec.body));
        const body = extentY(spec.body);
        const glass = extentY(spec.glass);
        expect(glass.front).toBeGreaterThan(body.front);
        expect(glass.rear).toBeLessThan(body.rear);
      });

      it('keeps its wheels and lights on the car', () => {
        for (const axle of spec.wheels.axles)
          expect(Math.abs(axle) + spec.wheels.lengthMm / 2).toBeLessThan(spec.lengthMm / 2);
        expect(spec.headlight.y).toBeLessThan(spec.wheels.axles[0]);
        expect(spec.taillight.y).toBeGreaterThan(spec.wheels.axles[1]);
        expect(spec.taillight.halfWidthMm).toBeLessThan(spec.widthMm / 2);
      });
    });
  }

  it('gives the Model 3 a roof bar and the Model Y one uninterrupted panel', () => {
    // The clearest way to tell apart the two most common cars on the road, from above.
    expect(art('3').roofBarY).toBeDefined();
    expect(art('Y').roofBarY).toBeUndefined();
  });

  it('runs the Model Y glass back to the tailgate and stops the 3 at the boot', () => {
    const y = extentY(art('Y').glass).rear / art('Y').lengthMm;
    const three = extentY(art('3').glass).rear / art('3').lengthMm;
    expect(y).toBeGreaterThan(three + 0.05);
  });

  it('gives the Model S the longest bonnet and the Model X the shortest', () => {
    const bonnet = (model: TeslaModel): number => {
      const spec = art(model);
      return (extentY(spec.glass).front - extentY(spec.body).front) / spec.lengthMm;
    };
    // The X's panoramic windscreen starts near the front axle; the S has a bonnet to spare.
    expect(bonnet('S')).toBeGreaterThan(bonnet('3'));
    expect(bonnet('X')).toBeLessThan(bonnet('3'));
    expect(bonnet('X')).toBeLessThan(bonnet('Y'));
  });

  it('gives the Model X falcon wing seams and nothing else', () => {
    for (const model of TESLA_MODELS)
      expect(art(model).falconSeamY === undefined).toBe(model !== 'X');
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

  it('draws five cars, not one car five times', () => {
    /*
     * Silhouette signature: the half-width of the body and of the greenhouse at eight stations
     * down the car, as a percentage of its length. Length is divided out on purpose — two
     * models that differ only in scale should still fail this. The old parametric sprites
     * would have: a Model 3 and a Model S have almost the same width-to-length ratio, so the
     * body outline alone barely separates them. What separates them is the glass.
     */
    const signature = (model: TeslaModel): number[] => {
      const spec = art(model);
      const body = samplePoints(spec.body, 24);
      const glass = samplePoints(spec.glass, 24);
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
