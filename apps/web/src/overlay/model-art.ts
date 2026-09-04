import type { TeslaModel } from '@teslawave/protocol';

/**
 * The cars, as traced outlines.
 *
 * Every model used to be the same parametric shape with different numbers in it: six points
 * down the flank, joined by `arcTo` with a corner radius. That produces a rounded rectangle
 * with a rounded rectangle on top, five times over, and no amount of nudging the numbers gets
 * you past it — a Model S and a Model Y came out as the same object at slightly different
 * proportions.
 *
 * So each model is now its own drawing: a chain of cubic bezier segments down the right-hand
 * flank, nose to tail, with the left side mirrored. That is what tracing an overhead view
 * actually produces, and it lets a bonnet curve like a bonnet, a hatchback end bluntly, and a
 * Cybertruck be made entirely of straight lines.
 *
 * Coordinates are **millimetres of the real car**, origin at the centre of the body, negative
 * y toward the nose. Working in real dimensions means the proportions cannot drift: the
 * published length, width and wheelbase of each car are checkable against the geometry, and
 * `model-art.test.ts` checks them.
 *
 * The one rule the mirroring imposes: a half-outline starts and ends on the centreline, and
 * the curve has to meet its own reflection smoothly there — so the first control point shares
 * its y with the start, and the last shares its y with the end. Otherwise the nose has a
 * crease down the middle. That is also checked.
 */

export type Pt = readonly [number, number];
export type Cubic = { readonly c1: Pt; readonly c2: Pt; readonly to: Pt };

/** A chain of cubics down the right-hand side. Mirror it to get the closed shape. */
export type Half = { readonly start: Pt; readonly segs: readonly Cubic[] };

export type Wheels = {
  /** Axle positions in mm, front negative. */
  readonly axles: readonly [number, number];
  readonly lengthMm: number;
  readonly widthMm: number;
  /** How far the tyre stands proud of the body at its widest, in mm. */
  readonly proudMm: number;
};

export type ModelArt = {
  readonly lengthMm: number;
  /** Body width, mirrors excluded — the published figure. */
  readonly widthMm: number;
  readonly wheelbaseMm: number;
  /** Distance from the nose to the front axle. */
  readonly frontOverhangMm: number;
  readonly body: Half;
  /** The greenhouse: windscreen, roof glass and rear screen as one traced panel. */
  readonly glass: Half;
  readonly wheels: Wheels;
  readonly mirrors: { readonly y: number; readonly reachMm: number; readonly chordMm: number };
  /** Transverse panel gaps: bonnet shut line, boot shut line, and so on. */
  readonly seams: readonly number[];
  readonly headlight: { readonly y: number; readonly innerMm: number; readonly outerMm: number };
  readonly taillight: { readonly y: number; readonly halfWidthMm: number };
  /** Where the windscreen meets the roof glass: a thin painted header across the greenhouse. */
  readonly headerY: number;
  /**
   * The Model 3's structural roof bar, painted body colour, splitting the glass in two. The
   * Model Y's roof is one uninterrupted panel — from above it is the clearest way to tell the
   * two apart, and they are the two most common cars on the road.
   */
  readonly roofBarY?: number;
  /**
   * The Model X's falcon wing doors hinge off the roof, so their cut lines run up into the
   * roof glass. Nothing else on the road has this.
   */
  readonly falconSeamY?: readonly [number, number];
  /** Cybertruck: no curves anywhere, and a vault where a rear screen would be. */
  readonly angular?: boolean;
  readonly vault?: Half;
};

const straight = (from: Pt, to: Pt): Cubic => ({
  c1: [from[0] + (to[0] - from[0]) / 3, from[1] + (to[1] - from[1]) / 3],
  c2: [from[0] + ((to[0] - from[0]) * 2) / 3, from[1] + ((to[1] - from[1]) * 2) / 3],
  to,
});

/** A closed polygon down the right side, for the Cybertruck, whose panels have no radius. */
const polyline = (start: Pt, points: readonly Pt[]): Half => {
  const segs: Cubic[] = [];
  let from = start;
  for (const point of points) {
    segs.push(straight(from, point));
    from = point;
  }
  return { start, segs };
};

export const MODEL_ART: Record<TeslaModel, ModelArt> = {
  /*
   * Model 3. 4694 x 1849, wheelbase 2875, front overhang 841.
   * Cab forward: the windscreen base sits close to the front axle, the bonnet is short, and
   * the glass runs almost to the boot. The tail is a saloon's — blunter than the nose.
   */
  '3': {
    lengthMm: 4694,
    widthMm: 1849,
    wheelbaseMm: 2875,
    frontOverhangMm: 841,
    body: {
      start: [0, -2347],
      segs: [
        { c1: [232, -2347], c2: [430, -2314], to: [566, -2214] },
        { c1: [690, -2122], c2: [796, -1996], to: [852, -1846] },
        { c1: [884, -1740], c2: [900, -1620], to: [906, -1480] },
        { c1: [910, -1160], c2: [908, -840], to: [906, -520] },
        { c1: [906, -180], c2: [916, 180], to: [924, 560] },
        { c1: [924, 900], c2: [916, 1180], to: [900, 1436] },
        { c1: [884, 1690], c2: [852, 1900], to: [796, 2064] },
        { c1: [740, 2200], c2: [640, 2290], to: [498, 2330] },
        { c1: [370, 2347], c2: [190, 2347], to: [0, 2347] },
      ],
    },
    glass: {
      start: [0, -1150],
      segs: [
        { c1: [196, -1150], c2: [352, -1096], to: [430, -980] },
        { c1: [482, -898], c2: [510, -784], to: [518, -630] },
        { c1: [526, -380], c2: [528, -80], to: [522, 280] },
        { c1: [516, 570], c2: [500, 800], to: [464, 972] },
        { c1: [432, 1128], c2: [372, 1240], to: [272, 1300] },
        { c1: [186, 1330], c2: [92, 1330], to: [0, 1330] },
      ],
    },
    wheels: { axles: [-1506, 1369], lengthMm: 720, widthMm: 245, proudMm: 46 },
    mirrors: { y: -890, reachMm: 236, chordMm: 196 },
    seams: [-1180, 1372, 1980],
    headlight: { y: -2205, innerMm: 300, outerMm: 760 },
    taillight: { y: 2270, halfWidthMm: 690 },
    headerY: -640,
    // Just behind the front seats, where the two roof panels meet.
    roofBarY: 40,
  },

  /*
   * Model Y. 4751 x 1921, wheelbase 2890, front overhang 863.
   * Taller and boxier than the 3, so in plan the flanks are more nearly parallel and the tail
   * is a blunt hatch. One uninterrupted glass roof, running back to the tailgate.
   */
  Y: {
    lengthMm: 4751,
    widthMm: 1921,
    wheelbaseMm: 2890,
    frontOverhangMm: 863,
    body: {
      start: [0, -2375],
      segs: [
        { c1: [252, -2375], c2: [468, -2340], to: [618, -2232] },
        { c1: [746, -2136], c2: [836, -2004], to: [886, -1856] },
        { c1: [914, -1750], c2: [934, -1630], to: [942, -1490] },
        { c1: [948, -1120], c2: [948, -740], to: [948, -360] },
        { c1: [950, 40], c2: [956, 440], to: [960, 820] },
        { c1: [960, 1120], c2: [954, 1400], to: [942, 1660] },
        { c1: [930, 1880], c2: [910, 2060], to: [872, 2196] },
        { c1: [838, 2296], c2: [746, 2352], to: [592, 2364] },
        { c1: [420, 2375], c2: [210, 2375], to: [0, 2375] },
      ],
    },
    glass: {
      start: [0, -1200],
      segs: [
        { c1: [204, -1200], c2: [364, -1140], to: [444, -1014] },
        { c1: [498, -930], c2: [528, -812], to: [538, -650] },
        { c1: [546, -340], c2: [550, 20], to: [550, 420] },
        { c1: [550, 760], c2: [546, 1040], to: [534, 1256] },
        { c1: [522, 1430], c2: [496, 1570], to: [434, 1654] },
        { c1: [356, 1740], c2: [190, 1760], to: [0, 1760] },
      ],
    },
    wheels: { axles: [-1512, 1378], lengthMm: 740, widthMm: 255, proudMm: 46 },
    mirrors: { y: -906, reachMm: 240, chordMm: 200 },
    seams: [-1230, 1792],
    headlight: { y: -2222, innerMm: 320, outerMm: 800 },
    taillight: { y: 2306, halfWidthMm: 740 },
    headerY: -660,
  },

  /*
   * Model S. 4970 x 1964, wheelbase 2960, front overhang 1000.
   * The long one: a bonnet half again as long as the 3's, and a fastback whose rear screen
   * runs most of the way to the tail rather than stopping at a boot lid.
   */
  S: {
    lengthMm: 4970,
    widthMm: 1964,
    wheelbaseMm: 2960,
    frontOverhangMm: 1000,
    body: {
      start: [0, -2485],
      segs: [
        { c1: [206, -2485], c2: [408, -2444], to: [540, -2334] },
        { c1: [676, -2216], c2: [792, -2056], to: [856, -1870] },
        { c1: [900, -1730], c2: [928, -1600], to: [938, -1450] },
        { c1: [948, -1080], c2: [950, -700], to: [950, -320] },
        { c1: [956, 60], c2: [972, 440], to: [982, 820] },
        { c1: [980, 1120], c2: [968, 1400], to: [944, 1660] },
        { c1: [920, 1890], c2: [878, 2100], to: [808, 2276] },
        { c1: [744, 2396], c2: [630, 2462], to: [470, 2478] },
        { c1: [330, 2485], c2: [166, 2485], to: [0, 2485] },
      ],
    },
    glass: {
      start: [0, -980],
      segs: [
        { c1: [188, -980], c2: [340, -916], to: [420, -790] },
        { c1: [472, -706], c2: [500, -578], to: [508, -400] },
        { c1: [516, -60], c2: [516, 300], to: [510, 660] },
        { c1: [502, 1000], c2: [482, 1300], to: [436, 1560] },
        { c1: [396, 1786], c2: [322, 1930], to: [206, 1998] },
        { c1: [130, 2040], c2: [64, 2050], to: [0, 2050] },
      ],
    },
    wheels: { axles: [-1485, 1475], lengthMm: 740, widthMm: 250, proudMm: 44 },
    mirrors: { y: -710, reachMm: 234, chordMm: 194 },
    seams: [-1000, 2076],
    headlight: { y: -2320, innerMm: 300, outerMm: 780 },
    taillight: { y: 2420, halfWidthMm: 700 },
    headerY: -420,
  },

  /*
   * Model X. 5037 x 1999, wheelbase 2965, front overhang 1006.
   * Two things nothing else on the road has, and both show from directly above: the
   * panoramic windscreen carries on over the front seats, so the glass starts near the front
   * axle; and the falcon wing doors cut two lines across the roof.
   */
  X: {
    lengthMm: 5037,
    widthMm: 1999,
    wheelbaseMm: 2965,
    frontOverhangMm: 1006,
    body: {
      start: [0, -2518],
      segs: [
        { c1: [262, -2518], c2: [486, -2478], to: [640, -2364] },
        { c1: [776, -2258], c2: [872, -2120], to: [922, -1950] },
        { c1: [956, -1830], c2: [978, -1700], to: [986, -1552] },
        { c1: [994, -1180], c2: [996, -800], to: [996, -420] },
        { c1: [998, -20], c2: [999, 400], to: [999, 800] },
        { c1: [996, 1120], c2: [988, 1420], to: [972, 1700] },
        { c1: [956, 1940], c2: [928, 2140], to: [876, 2306] },
        { c1: [830, 2424], c2: [716, 2494], to: [548, 2512] },
        { c1: [386, 2518], c2: [192, 2518], to: [0, 2518] },
      ],
    },
    glass: {
      start: [0, -1740],
      segs: [
        { c1: [174, -1740], c2: [322, -1656], to: [404, -1500] },
        { c1: [468, -1380], c2: [508, -1218], to: [524, -1020] },
        { c1: [542, -640], c2: [550, -240], to: [550, 200] },
        { c1: [550, 620], c2: [544, 1000], to: [526, 1310] },
        { c1: [510, 1546], c2: [476, 1728], to: [404, 1844] },
        { c1: [336, 1950], c2: [180, 1984], to: [0, 1984] },
      ],
    },
    wheels: { axles: [-1512, 1453], lengthMm: 760, widthMm: 265, proudMm: 46 },
    mirrors: { y: -930, reachMm: 244, chordMm: 202 },
    seams: [-1760, 2012],
    headlight: { y: -2360, innerMm: 320, outerMm: 820 },
    taillight: { y: 2450, halfWidthMm: 760 },
    // Where the windscreen glass ends and the roof glass begins: on the X that join is much
    // further back than on anything else, because the windscreen goes over your head.
    headerY: -1020,
    falconSeamY: [-380, 560],
  },

  /*
   * Cybertruck. 5683 x 2200, wheelbase 3644, front overhang 1000.
   * Straight lines throughout, which is why it gets polylines rather than curves: a blunt
   * leading edge, chamfered front corners, parallel flanks, a squared tail, and a vault
   * behind the cabin where every other model has a rear screen.
   */
  CT: {
    lengthMm: 5683,
    widthMm: 2200,
    wheelbaseMm: 3644,
    frontOverhangMm: 1000,
    body: polyline(
      [0, -2841],
      [
        [560, -2841],
        [962, -2540],
        [1076, -2140],
        [1100, -1480],
        [1100, 1480],
        [1088, 2280],
        [1008, 2694],
        [700, 2841],
        [0, 2841],
      ],
    ),
    // A flat-edged trapezoid: the windscreen's leading edge is a straight line across the
    // wedge, and it barely tapers on its way back to the roof.
    glass: polyline(
      [0, -1620],
      [
        [700, -1620],
        [686, -900],
        [672, 180],
        [0, 180],
      ],
    ),
    wheels: { axles: [-1841, 1803], lengthMm: 880, widthMm: 300, proudMm: 56 },
    mirrors: { y: -1130, reachMm: 236, chordMm: 176 },
    seams: [-1620, 300],
    headlight: { y: -2800, innerMm: 0, outerMm: 900 },
    taillight: { y: 2800, halfWidthMm: 900 },
    headerY: -900,
    angular: true,
    vault: polyline(
      [0, 300],
      [
        [860, 300],
        [880, 2400],
        [0, 2400],
      ],
    ),
  },
};

/** Every point the curve actually passes through, at `steps` samples per segment. */
export function samplePoints(half: Half, steps = 12): Pt[] {
  const out: Pt[] = [half.start];
  let from = half.start;
  for (const seg of half.segs) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      out.push([
        u * u * u * from[0] + 3 * u * u * t * seg.c1[0] + 3 * u * t * t * seg.c2[0] + t * t * t * seg.to[0],
        u * u * u * from[1] + 3 * u * u * t * seg.c1[1] + 3 * u * t * t * seg.c2[1] + t * t * t * seg.to[1],
      ]);
    }
    from = seg.to;
  }
  return out;
}

/** The last point of a half-outline, which by construction sits on the centreline. */
export const endOf = (half: Half): Pt => half.segs.at(-1)?.to ?? half.start;
