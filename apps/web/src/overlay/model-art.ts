import type { TeslaModel } from '@teslawave/protocol';

/**
 * The cars, drawn from directly above, in millimetres of the real car.
 *
 * Each model is its own drawing: a body outline, the greenhouse, every glass panel, the
 * frunk and boot shut lines, the bonnet creases, the lights, the mirrors, the wheels and the
 * door cuts. Nothing is a parametric template with different numbers in it — that produced
 * five rounded rectangles — and nothing is traced from a photograph, which would be a
 * derivative of someone's copyrighted image. The geometry is authored from published
 * dimensions and from the features that actually tell the cars apart from above: the
 * Model 3's split glass roof, the Model Y's single panel and hatch, the Model S's long
 * bonnet and fastback, the Model X's panoramic windscreen and falcon-wing roof glass, the
 * Cybertruck's straight lines and vault.
 *
 * Origin is the centre of the body, negative y toward the nose, positive x to the right.
 * Symmetric outlines are authored as the right-hand half only and mirrored, so a bonnet
 * curve and its reflection can never disagree. Curves are written as anchor points and
 * smoothed into cubic beziers (Catmull-Rom), because anchor points can be checked against a
 * published width and control points cannot. Corners are flagged where a panel edge really
 * is a corner.
 *
 * Both renderers read this file: `car-scene.ts` turns it into a list of paint operations,
 * `ui/CarSvg.tsx` emits those as SVG, and `overlay/sprites.ts` rasterises them for the map.
 * `model-art.test.ts` checks the proportions against the published figures.
 */

export type Pt = readonly [number, number];
export type Cubic = { readonly c1: Pt; readonly c2: Pt; readonly to: Pt };

/**
 * A chain of cubics. Closed shapes that sit on the centreline are authored as the right-hand
 * half and mirrored; features that live on one side (a mirror, a headlight) are authored
 * whole and drawn twice.
 */
export type Path = { readonly start: Pt; readonly segs: readonly Cubic[]; readonly closed: boolean };

export type Lamp = {
  /** Centre line of the lamp, right-hand side, drawn as a thick stroke and mirrored. */
  readonly path: Path;
  readonly widthMm: number;
};

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
  /** The outer silhouette, right half. */
  readonly body: Path;
  /** The greenhouse: pillars, roof rails and side glass as one dark frame, right half. */
  readonly frame: Path;
  /**
   * The painted A-pillar and roof rail, right side: an open line along the outer edge of the
   * glass from the base of the windscreen to the end of the rearmost panel.
   */
  readonly rail: Path;
  /** Glass panels inside the frame, nose to tail, right halves. */
  readonly windscreen: Path;
  readonly roofGlass: readonly Path[];
  readonly rearGlass?: Path;
  /** The Model X: two falcon-wing door windows either side of a painted spine. */
  readonly falconGlass?: Path;
  /** The Model 3: a painted cross bar splitting the glass roof in two. */
  readonly roofBar?: { readonly y: number; readonly heightMm: number };
  /** The Cybertruck: a tonneau over the bed where a rear screen would be. */
  readonly vault?: Path;
  /** Frunk and boot shut lines, right half, ending on the centreline. */
  readonly frunk: Path;
  readonly boot?: Path;
  /** Bonnet creases, right side. */
  readonly creases: readonly Path[];
  /** Transverse door cuts, as y positions across the shoulder. */
  readonly doorCuts: readonly number[];
  readonly headlight: Lamp;
  readonly taillight: Lamp;
  readonly mirror: Path;
  readonly wheels: Wheels;
  /**
   * The wipers, parked, authored whole because a left-hand-drive car is not symmetric: two
   * arms lying along the base of the windscreen, or the Cybertruck's single arm standing
   * up the driver's side.
   */
  readonly wipers: readonly Path[];
  /** The Cybertruck: unpainted trapezoid flares over each wheel, right side, mirrored. */
  readonly flares?: readonly Path[];
  /** No curves anywhere: sharp corners on the wheels and mirrors too. */
  readonly angular?: boolean;
};

type Anchor = Pt | { readonly corner: Pt };

const at = (a: Anchor): Pt => (Array.isArray(a) ? (a as Pt) : (a as { corner: Pt }).corner);
const isCorner = (a: Anchor): boolean => !Array.isArray(a);
const corner = (pt: Pt): Anchor => ({ corner: pt });

/**
 * Catmull-Rom through the anchors, as cubics. Where the path starts or ends on the
 * centreline the phantom point beyond it is the reflection of its neighbour, which gives the
 * horizontal tangent the mirror needs — otherwise the nose would have a crease down it.
 * Elsewhere the ends use one-sided tangents.
 */
export function smooth(anchors: readonly Anchor[], closed = false, tension = 1): Path {
  const pts = anchors.map(at);
  const n = pts.length;
  const point = (i: number): Pt => {
    if (i >= 0 && i < n) return pts[i] as Pt;
    if (closed) return pts[((i % n) + n) % n] as Pt;
    if (i < 0) {
      const p0 = pts[0] as Pt;
      const p1 = pts[1] as Pt;
      return p0[0] === 0 ? [-p1[0], p1[1]] : [2 * p0[0] - p1[0], 2 * p0[1] - p1[1]];
    }
    const pn = pts[n - 1] as Pt;
    const pm = pts[n - 2] as Pt;
    return pn[0] === 0 ? [-pm[0], pm[1]] : [2 * pn[0] - pm[0], 2 * pn[1] - pm[1]];
  };
  const segs: Cubic[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = point(i - 1);
    const p1 = point(i);
    const p2 = point(i + 1);
    const p3 = point(i + 2);
    const cornerIn = isCorner(anchors[i] as Anchor);
    const cornerOut = isCorner(anchors[(i + 1) % n] as Anchor);
    const t1: Pt = cornerIn ? [p2[0] - p1[0], p2[1] - p1[1]] : [(p2[0] - p0[0]) / 2, (p2[1] - p0[1]) / 2];
    const t2: Pt = cornerOut ? [p2[0] - p1[0], p2[1] - p1[1]] : [(p3[0] - p1[0]) / 2, (p3[1] - p1[1]) / 2];
    segs.push({
      c1: [p1[0] + (t1[0] * tension) / 3, p1[1] + (t1[1] * tension) / 3],
      c2: [p2[0] - (t2[0] * tension) / 3, p2[1] - (t2[1] * tension) / 3],
      to: p2,
    });
  }
  return { start: pts[0] as Pt, segs, closed };
}

/** Straight lines only, for the Cybertruck. */
export function polyline(points: readonly Pt[], closed = false): Path {
  const segs: Cubic[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as Pt;
    const to = points[i] as Pt;
    segs.push({
      c1: [from[0] + (to[0] - from[0]) / 3, from[1] + (to[1] - from[1]) / 3],
      c2: [from[0] + ((to[0] - from[0]) * 2) / 3, from[1] + ((to[1] - from[1]) * 2) / 3],
      to,
    });
  }
  return { start: points[0] as Pt, segs, closed };
}

const line = (from: Pt, to: Pt): Path => polyline([from, to]);

/** A lamp along a line or a gentle curve, right-hand side. */
const lamp = (widthMm: number, ...anchors: Anchor[]): Lamp => ({
  path: anchors.length === 2 ? line(at(anchors[0] as Anchor), at(anchors[1] as Anchor)) : smooth(anchors),
  widthMm,
});

/** The door mirror: a teardrop hung off the shoulder just behind the A-pillar. */
const mirror = (bodyX: number, y: number, reach = 175, chord = 240, angular = false): Path => {
  const pts: Pt[] = [
    [bodyX - 70, y - chord * 0.5],
    [bodyX + reach * 0.55, y - chord * 0.46],
    [bodyX + reach, y - chord * 0.1],
    [bodyX + reach * 0.88, y + chord * 0.3],
    [bodyX + reach * 0.3, y + chord * 0.5],
    [bodyX - 70, y + chord * 0.42],
  ];
  return angular ? polyline(pts, true) : smooth(pts, true, 0.9);
};

/**
 * Two wiper arms parked along the base of a windscreen whose lower edge sits at `baseY` on
 * the centreline and curves back by `sag` at the pillars, `halfW` out. Left-hand drive: the
 * driver's arm reaches from the left pillar to the middle, the passenger's from the middle
 * to the right, both blades pointing right, both lifted a little further off the base at
 * their pivots than at their tips, which is how they lie on the real car.
 */
const parkedWipers = (baseY: number, halfW: number, sag: number): Path[] => {
  const edge = (x: number): number => baseY + sag * (x / halfW) ** 2;
  return [
    smooth([
      [-halfW * 0.8, edge(-halfW * 0.8) + 95],
      [-halfW * 0.45, edge(-halfW * 0.45) + 75],
      [-halfW * 0.08, edge(-halfW * 0.08) + 60],
    ]),
    smooth([
      [halfW * 0.04, edge(halfW * 0.04) + 105],
      [halfW * 0.42, edge(halfW * 0.42) + 80],
      [halfW * 0.8, edge(halfW * 0.8) + 65],
    ]),
  ];
};

export const MODEL_ART: Record<TeslaModel, ModelArt> = {
  /*
   * Model 3 (2024, Highland). 4720 x 1848, wheelbase 2875, front overhang 850.
   * Cab-forward saloon: short bonnet, glass running almost to the boot, and a roof in two
   * panels with a painted cross bar over the B-pillar. Slim headlights swept back into the
   * fenders; C-shaped tail lamps wrapping the rear corners.
   */
  '3': {
    lengthMm: 4720,
    widthMm: 1848,
    wheelbaseMm: 2875,
    frontOverhangMm: 850,
    body: smooth([
      [0, -2360],
      [400, -2338],
      [670, -2210],
      [830, -2010],
      [896, -1740],
      [912, -1510],
      [900, -1200],
      [896, -500],
      [902, 400],
      [914, 1000],
      [924, 1365],
      [912, 1720],
      [870, 1990],
      [740, 2210],
      [500, 2330],
      [0, 2360],
    ]),
    frame: smooth([
      [0, -1265],
      [520, -1224],
      [676, -1110],
      [722, -700],
      [732, 200],
      [720, 950],
      [664, 1500],
      [464, 1810],
      [0, 1905],
    ]),
    rail: smooth([
      [500, -1176],
      [606, -1020],
      [634, -700],
      [628, 60],
      [610, 1000],
      [520, 1520],
      [350, 1800],
    ]),
    windscreen: smooth([
      [0, -1225],
      [500, -1176],
      [606, -1020],
      [630, -800],
      corner([622, -600]),
      [0, -600],
    ]),
    roofGlass: [
      smooth([[0, -540], corner([604, -540]), corner([608, 60]), [0, 60]]),
      smooth([[0, 180], corner([606, 180]), [588, 1000], [512, 1520], [340, 1800], [0, 1850]]),
    ],
    roofBar: { y: 120, heightMm: 120 },
    frunk: smooth([
      [896, -1180],
      [800, -1380],
      [778, -1900],
      [610, -2160],
      [0, -2262],
    ]),
    boot: smooth([
      [880, 1990],
      [740, 2200],
      [0, 2290],
    ]),
    creases: [
      smooth([
        [330, -1300],
        [300, -1720],
        [240, -2090],
      ]),
    ],
    doorCuts: [-1120, 80, 1060],
    headlight: lamp(110, [430, -2230], [810, -2000]),
    taillight: lamp(90, [826, 2000], [700, 2160], [470, 2255]),
    wipers: parkedWipers(-1225, 606, 72),
    mirror: mirror(896, -1010),
    wheels: { axles: [-1510, 1365], lengthMm: 700, widthMm: 245, proudMm: 56 },
  },

  /*
   * Model Y (2025, Juniper). 4792 x 1921, wheelbase 2890, front overhang 870.
   * Taller and boxier than the 3, so in plan the flanks are nearly parallel and the tail is
   * a blunt hatch. One uninterrupted glass roof back to the liftgate, and a thin light bar
   * across both the nose and the tail.
   */
  Y: {
    lengthMm: 4792,
    widthMm: 1921,
    wheelbaseMm: 2890,
    frontOverhangMm: 870,
    body: smooth([
      [0, -2396],
      [420, -2372],
      [700, -2240],
      [866, -2020],
      [936, -1760],
      [950, -1526],
      [944, -1200],
      [942, -500],
      [948, 300],
      [956, 900],
      [960, 1364],
      [952, 1760],
      [920, 2060],
      [800, 2270],
      [520, 2372],
      [0, 2396],
    ]),
    frame: smooth([
      [0, -1290],
      [540, -1244],
      [706, -1130],
      [760, -700],
      [770, 300],
      [764, 1300],
      [716, 1860],
      [504, 2140],
      [0, 2200],
    ]),
    rail: smooth([
      [520, -1196],
      [636, -1030],
      [656, -700],
      [646, 700],
      [636, 1450],
      [590, 1900],
      [380, 2110],
    ]),
    windscreen: smooth([
      [0, -1250],
      [520, -1196],
      [636, -1030],
      [658, -820],
      corner([650, -620]),
      [0, -620],
    ]),
    roofGlass: [
      smooth([[0, -560], corner([636, -560]), corner([646, 700]), corner([634, 1430]), [0, 1445]]),
    ],
    rearGlass: smooth([[0, 1560], corner([616, 1560]), [570, 1915], [370, 2110], [0, 2150]]),
    frunk: smooth([
      [944, -1220],
      [845, -1440],
      [822, -1950],
      [650, -2200],
      [0, -2300],
    ]),
    boot: smooth([
      [900, 2160],
      [720, 2300],
      [0, 2350],
    ]),
    creases: [
      smooth([
        [340, -1330],
        [310, -1760],
        [250, -2140],
      ]),
    ],
    doorCuts: [-1150, 90, 1110],
    headlight: lamp(60, [0, -2300], [520, -2262], [760, -2140]),
    taillight: lamp(72, [0, 2296], [560, 2276], [840, 2140]),
    wipers: parkedWipers(-1250, 636, 81),
    mirror: mirror(944, -1040, 155, 200),
    wheels: { axles: [-1526, 1364], lengthMm: 720, widthMm: 255, proudMm: 56 },
  },

  /*
   * Model S (2021). 4970 x 1964, wheelbase 2960, front overhang 1000.
   * The long one: a bonnet half again as long as the 3's, slim horizontal headlights, a
   * fastback whose rear screen runs most of the way to the tail, and a full-width light bar.
   */
  S: {
    lengthMm: 4970,
    widthMm: 1964,
    wheelbaseMm: 2960,
    frontOverhangMm: 1000,
    body: smooth([
      [0, -2485],
      [400, -2460],
      [660, -2340],
      [850, -2120],
      [944, -1820],
      [966, -1485],
      [956, -1100],
      [950, -300],
      [958, 500],
      [972, 1100],
      [982, 1475],
      [970, 1820],
      [930, 2090],
      [820, 2310],
      [560, 2445],
      [0, 2485],
    ]),
    frame: smooth([
      [0, -930],
      [520, -888],
      [706, -790],
      [760, -300],
      [770, 500],
      [756, 1210],
      [668, 1740],
      [466, 2010],
      [0, 2080],
    ]),
    rail: smooth([
      [500, -846],
      [618, -700],
      [650, -400],
      [642, 760],
      [630, 860],
      [580, 1400],
      [464, 1800],
      [300, 1990],
    ]),
    windscreen: smooth([
      [0, -890],
      [500, -846],
      [618, -700],
      [652, -500],
      corner([646, -300]),
      [0, -300],
    ]),
    roofGlass: [smooth([[0, -240], corner([638, -240]), corner([644, 760]), [0, 760]])],
    rearGlass: smooth([[0, 860], corner([628, 860]), [580, 1400], [464, 1800], [290, 1990], [0, 2020]]),
    frunk: smooth([
      [956, -1000],
      [866, -1240],
      [850, -2000],
      [650, -2300],
      [0, -2400],
    ]),
    boot: smooth([
      [910, 2100],
      [740, 2320],
      [0, 2410],
    ]),
    creases: [
      smooth([
        [330, -960],
        [320, -1600],
        [270, -2200],
      ]),
    ],
    doorCuts: [-800, 260, 1250],
    headlight: lamp(90, [470, -2380], [870, -2130]),
    taillight: lamp(64, [0, 2382], [600, 2362], [886, 2230]),
    wipers: parkedWipers(-890, 618, 67),
    mirror: mirror(956, -740),
    wheels: { axles: [-1485, 1475], lengthMm: 740, widthMm: 255, proudMm: 56 },
  },

  /*
   * Model X (2021). 5057 x 1999, wheelbase 2965, front overhang 1030.
   * Two things nothing else on the road has, and both show from above: the panoramic
   * windscreen carries on over the front seats, so the glass starts near the front axle;
   * and the falcon-wing doors each carry a window in the roof, either side of a painted spine.
   */
  X: {
    lengthMm: 5057,
    widthMm: 1999,
    wheelbaseMm: 2965,
    frontOverhangMm: 1030,
    body: smooth([
      [0, -2528],
      [440, -2498],
      [740, -2370],
      [910, -2140],
      [978, -1850],
      [990, -1499],
      [984, -1100],
      [984, -300],
      [990, 500],
      [996, 1100],
      [999, 1466],
      [990, 1820],
      [950, 2130],
      [830, 2360],
      [560, 2492],
      [0, 2528],
    ]),
    frame: smooth([
      [0, -1500],
      [560, -1448],
      [736, -1320],
      [794, -800],
      [806, 200],
      [798, 1300],
      [736, 1900],
      [504, 2180],
      [0, 2240],
    ]),
    rail: smooth([
      [540, -1400],
      [666, -1210],
      [694, -700],
      [688, -160],
      [676, 600],
      [678, 1350],
      [630, 1520],
      [555, 1990],
      [340, 2170],
    ]),
    windscreen: smooth([
      [0, -1450],
      [540, -1400],
      [666, -1210],
      [696, -900],
      [692, -400],
      corner([686, -160]),
      [0, -160],
    ]),
    roofGlass: [],
    falconGlass: smooth(
      [corner([150, -80]), corner([666, -80]), corner([676, 1350]), corner([150, 1400])],
      true,
    ),
    rearGlass: smooth([[0, 1520], corner([618, 1520]), [552, 1990], [330, 2170], [0, 2200]]),
    frunk: smooth([
      [984, -1420],
      [890, -1600],
      [880, -2060],
      [660, -2340],
      [0, -2440],
    ]),
    boot: smooth([
      [930, 2150],
      [750, 2370],
      [0, 2455],
    ]),
    creases: [
      smooth([
        [330, -1500],
        [310, -1900],
        [270, -2250],
      ]),
    ],
    doorCuts: [-1340, 60, 1450],
    headlight: lamp(90, [480, -2420], [890, -2180]),
    taillight: lamp(64, [0, 2424], [620, 2404], [900, 2270]),
    wipers: parkedWipers(-1450, 666, 76),
    mirror: mirror(984, -1180, 185, 250),
    wheels: { axles: [-1499, 1466], lengthMm: 760, widthMm: 265, proudMm: 58 },
  },

  /*
   * Cybertruck. 5683 x 2200, wheelbase 3635, front overhang 1000.
   * Straight lines throughout: a blunt front with chamfered corners, unpainted trapezoid
   * wheel flares standing proud of the doors, a windscreen the size of a table, a full-width
   * light bar at each end, and a vault behind the cabin where every other model has a rear
   * screen.
   */
  CT: {
    lengthMm: 5683,
    widthMm: 2200,
    wheelbaseMm: 3635,
    frontOverhangMm: 1000,
    body: polyline([
      [0, -2841],
      [800, -2841],
      [960, -2720],
      [1040, -2380],
      [1100, -2100],
      [1100, -1560],
      [1015, -1380],
      [1015, 1300],
      [1100, 1500],
      [1100, 2100],
      [1080, 2450],
      [1000, 2760],
      [800, 2841],
      [0, 2841],
    ]),
    frame: polyline([
      [0, -1800],
      [900, -1800],
      [780, -130],
      [750, 320],
      [0, 320],
    ]),
    rail: polyline([
      [840, -1740],
      [740, -160],
      [720, -90],
      [706, 250],
    ]),
    windscreen: polyline([
      [0, -1740],
      [840, -1740],
      [740, -160],
      [0, -160],
    ]),
    roofGlass: [polyline([[0, -90], [720, -90], [706, 250], [0, 250]])],
    vault: polyline([
      [0, 390],
      [840, 390],
      [860, 2470],
      [0, 2470],
    ]),
    frunk: polyline([
      [1050, -1720],
      [1040, -2330],
      [880, -2680],
      [0, -2710],
    ]),
    boot: polyline([
      [1000, 2480],
      [900, 2700],
      [0, 2720],
    ]),
    creases: [line([360, -1860], [330, -2600])],
    doorCuts: [-1500, 40, 1330],
    headlight: lamp(70, [0, -2730], [800, -2730], [960, -2630]),
    taillight: lamp(80, [0, 2752], [880, 2752], [1010, 2640]),
    // One arm, the length of the glass, parked up the driver's side of the screen.
    wipers: [line([-770, -1690], [-690, -230])],
    // The flares slope out and down from the sail line to the widest point, so from above
    // each is a broad trapezoid, not the sliver that stands proud of the doors.
    flares: [
      polyline([[930, -2520], [1100, -2100], [1100, -1560], [930, -1230]], true),
      polyline([[930, 1180], [1100, 1500], [1100, 2100], [930, 2420]], true),
    ],
    mirror: mirror(1015, -1350, 190, 230, true),
    wheels: { axles: [-1841, 1794], lengthMm: 880, widthMm: 315, proudMm: 62 },
    angular: true,
  },
};

/** Every point the curve actually passes through, at `steps` samples per segment. */
export function samplePoints(path: Path, steps = 12): Pt[] {
  const out: Pt[] = [path.start];
  let from = path.start;
  for (const seg of path.segs) {
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

/** The last point of a path, which for a mirrored half sits on the centreline. */
export const endOf = (path: Path): Pt => path.segs.at(-1)?.to ?? path.start;

const num = (v: number): string => (Math.round(v * 10) / 10).toString();

/** SVG path data for a path as authored, or its reflection across the centreline. */
export function pathData(path: Path, mirror = false): string {
  const sx = mirror ? -1 : 1;
  let d = `M${num(sx * path.start[0])} ${num(path.start[1])}`;
  for (const seg of path.segs)
    d += `C${num(sx * seg.c1[0])} ${num(seg.c1[1])} ${num(sx * seg.c2[0])} ${num(seg.c2[1])} ${num(sx * seg.to[0])} ${num(seg.to[1])}`;
  return path.closed ? `${d}Z` : d;
}

/**
 * SVG path data for a half-outline and its mirror image as one closed shape: down the right
 * flank, then back up the left as the same curve with x negated, walked in reverse.
 */
export function mirroredPathData(half: Path): string {
  let d = `M${num(half.start[0])} ${num(half.start[1])}`;
  for (const seg of half.segs)
    d += `C${num(seg.c1[0])} ${num(seg.c1[1])} ${num(seg.c2[0])} ${num(seg.c2[1])} ${num(seg.to[0])} ${num(seg.to[1])}`;
  for (let i = half.segs.length - 1; i >= 0; i--) {
    const seg = half.segs[i] as Cubic;
    const from = i === 0 ? half.start : ((half.segs[i - 1] as Cubic).to as Pt);
    d += `C${num(-seg.c2[0])} ${num(seg.c2[1])} ${num(-seg.c1[0])} ${num(seg.c1[1])} ${num(-from[0])} ${num(from[1])}`;
  }
  return `${d}Z`;
}

/** The widest half-width of an outline, in millimetres. */
export function halfWidthOf(path: Path): number {
  let max = 0;
  for (const p of samplePoints(path, 8)) max = Math.max(max, Math.abs(p[0]));
  return max;
}
