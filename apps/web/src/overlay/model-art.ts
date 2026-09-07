import type { TeslaModel } from '@teslawave/protocol';

/**
 * The cars, drawn from directly above, in millimetres of the real car.
 *
 * Each model is its own drawing: a body outline, the greenhouse, every glass panel, the
 * frunk and boot shut lines, the bonnet creases, the lights, the mirrors, the wheels and the
 * door cuts. Nothing is a parametric template with different numbers in it — that produced
 * five rounded rectangles — and nothing is traced from a photograph, which would be a
 * derivative of someone's copyrighted image. The geometry is authored from published
 * dimensions and from measurements taken off published plan-view drawings — the body's
 * half-width every 50 mm down the car, and where each panel of glass starts and stops —
 * and from the features that actually tell the cars apart from above: the Model 3's split
 * glass roof, the Model Y's single panel and hatch, the Model S's long bonnet and fastback,
 * the Model X's panoramic windscreen and falcon-wing roof glass, the Cybertruck's straight
 * lines and vault.
 *
 * Two things about a car from directly above that are easy to get wrong: the windscreen is
 * long (a metre of the Model 3's length is windscreen, and the X's runs to the B-pillar),
 * and the roof glass is narrow — outboard of it sit a painted rail, then the side glass seen
 * nearly edge-on as a dark band a hand-span wide, then the painted shoulder, and only then
 * the widest point of the body.
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
  /** The Model 3: a black cross bar splitting the glass roof in two. */
  readonly roofBar?: { readonly y: number; readonly heightMm: number };
  /**
   * Body-coloured panels inside the greenhouse frame, right halves: the Model Y's roof
   * behind the glass, the Model X's beam between windscreen and falcon doors and the spine
   * between their windows.
   */
  readonly roofPaint?: readonly Path[];
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
   * Cab-forward saloon: a windscreen a metre long in plan, a roof in two panels with a
   * black cross bar between them, and a rear screen that runs to the boot. Slim headlights
   * swept back along the fenders; C-shaped tail lamps wrapping the rear corners.
   */
  '3': {
    lengthMm: 4720,
    widthMm: 1848,
    wheelbaseMm: 2875,
    frontOverhangMm: 850,
    body: smooth([
      [0, -2360],
      [400, -2348],
      [600, -2250],
      [773, -2100],
      [860, -2000],
      [904, -1900],
      [920, -1780],
      [924, -1550],
      [922, -1250],
      [913, -950],
      [907, -600],
      [907, 0],
      [907, 700],
      [912, 950],
      [922, 1150],
      [924, 1450],
      [920, 1700],
      [905, 1820],
      [875, 1910],
      [841, 2000],
      [803, 2100],
      [755, 2180],
      [666, 2250],
      [569, 2300],
      [391, 2350],
      [0, 2360],
    ]),
    frame: smooth([
      [0, -1230],
      [350, -1220],
      [560, -1170],
      [680, -1000],
      [760, -800],
      [795, -500],
      [800, 0],
      [800, 600],
      [795, 1000],
      [775, 1350],
      [720, 1600],
      [600, 1780],
      [380, 1870],
      [0, 1885],
    ]),
    rail: smooth([
      [560, -1130],
      [640, -950],
      [690, -600],
      [700, -236],
      [600, -114],
      [600, 443],
      [560, 598],
      [550, 1000],
      [545, 1450],
      [515, 1680],
      [420, 1800],
      [240, 1860],
    ]),
    windscreen: smooth([
      [0, -1169],
      [300, -1160],
      [500, -1118],
      [610, -990],
      [655, -800],
      [667, -500],
      [662, -300],
      corner([630, -236]),
      [0, -231],
    ]),
    roofGlass: [
      smooth([[0, -114], corner([550, -114]), corner([550, 443]), [0, 443]]),
      smooth([[0, 598], corner([508, 598]), [505, 1000], [500, 1450], [470, 1680], [380, 1790], [200, 1835], [0, 1841]]),
    ],
    roofBar: { y: 520, heightMm: 70 },
    frunk: smooth([
      [801, -968],
      [790, -1250],
      [760, -1550],
      [700, -1800],
      [600, -1980],
      [470, -2110],
      [280, -2230],
      [0, -2262],
    ]),
    boot: smooth([
      [830, 1990],
      [770, 2150],
      [600, 2260],
      [0, 2300],
    ]),
    creases: [
      smooth([
        [340, -1300],
        [300, -1720],
        [250, -2090],
      ]),
    ],
    doorCuts: [-712, 290, 1140],
    headlight: lamp(90, [450, -2219], [843, -1763]),
    taillight: lamp(80, [890, 1840], [800, 2020], [640, 2170], [450, 2255]),
    wipers: parkedWipers(-1169, 610, 73),
    mirror: mirror(907, -608, 166, 240),
    wheels: { axles: [-1510, 1365], lengthMm: 700, widthMm: 245, proudMm: 56 },
  },

  /*
   * Model Y (2025, Juniper). 4792 x 1921, wheelbase 2890, front overhang 870.
   * Taller and boxier than the 3, so in plan the flanks are nearly parallel and the tail is
   * a blunt hatch. One uninterrupted glass roof, a painted strip of roof behind it, then the
   * liftgate's own glass; a thin light bar across both the nose and the tail.
   */
  Y: {
    lengthMm: 4792,
    widthMm: 1921,
    wheelbaseMm: 2890,
    frontOverhangMm: 870,
    body: smooth([
      [0, -2396],
      [250, -2392],
      [440, -2350],
      [645, -2250],
      [787, -2150],
      [892, -2050],
      [923, -1950],
      [940, -1800],
      [947, -1500],
      [944, -1200],
      [925, -1000],
      [917, -700],
      [916, 0],
      [911, 700],
      [925, 920],
      [952, 1100],
      [960, 1350],
      [950, 1600],
      [917, 1800],
      [848, 2000],
      [739, 2150],
      [542, 2250],
      [367, 2350],
      [150, 2390],
      [0, 2396],
    ]),
    frame: smooth([
      [0, -1240],
      [350, -1232],
      [580, -1195],
      [720, -1000],
      [800, -800],
      [836, -400],
      [840, 200],
      [836, 800],
      [830, 1300],
      [800, 1650],
      [720, 1900],
      [560, 2090],
      [300, 2170],
      [0, 2180],
    ]),
    rail: smooth([
      [600, -1160],
      [655, -900],
      [665, -600],
      [665, -335],
      [625, -238],
      [625, 500],
      [625, 1250],
      [560, 1450],
      [515, 1594],
      [505, 1900],
      [430, 2090],
      [260, 2160],
    ]),
    windscreen: smooth([
      [0, -1200],
      [300, -1192],
      [500, -1150],
      [600, -1030],
      [640, -850],
      [650, -600],
      [648, -400],
      corner([620, -335]),
      [0, -330],
    ]),
    roofGlass: [smooth([[0, -238], corner([581, -238]), corner([581, 1250]), [0, 1250]])],
    roofPaint: [smooth([[0, 1300], corner([700, 1300]), corner([640, 1560]), [0, 1560]])],
    rearGlass: smooth([[0, 1594], corner([470, 1594]), [460, 1900], [400, 2080], [220, 2135], [0, 2140]]),
    frunk: smooth([
      [863, -1193],
      [840, -1450],
      [800, -1700],
      [770, -1900],
      [700, -2080],
      [560, -2220],
      [300, -2300],
      [0, -2320],
    ]),
    boot: smooth([
      [820, 2130],
      [700, 2250],
      [450, 2330],
      [0, 2350],
    ]),
    creases: [
      smooth([
        [340, -1300],
        [310, -1760],
        [250, -2140],
      ]),
    ],
    doorCuts: [-800, 300, 1240],
    headlight: lamp(60, [0, -2300], [520, -2262], [740, -2140]),
    taillight: lamp(72, [0, 2300], [500, 2285], [790, 2150]),
    wipers: parkedWipers(-1200, 600, 60),
    mirror: mirror(917, -740, 160, 250),
    wheels: { axles: [-1526, 1364], lengthMm: 720, widthMm: 255, proudMm: 56 },
  },

  /*
   * Model S (2021). 4970 x 1964, wheelbase 2960, front overhang 1000.
   * The long one: a bonnet that ends a full 430 mm short of the nose, where the front fascia
   * takes over, slim horizontal headlights, wide painted roof rails, a fastback whose rear
   * screen runs most of the way to the tail, and a full-width light bar.
   */
  S: {
    lengthMm: 4970,
    widthMm: 1964,
    wheelbaseMm: 2960,
    frontOverhangMm: 1000,
    body: smooth([
      [0, -2485],
      [290, -2480],
      [548, -2400],
      [706, -2300],
      [835, -2200],
      [906, -2100],
      [939, -2000],
      [957, -1800],
      [967, -1500],
      [962, -1250],
      [946, -1050],
      [938, -700],
      [940, 0],
      [942, 600],
      [953, 900],
      [978, 1100],
      [982, 1400],
      [978, 1700],
      [946, 1900],
      [909, 2000],
      [875, 2100],
      [832, 2200],
      [762, 2300],
      [696, 2350],
      [582, 2400],
      [440, 2450],
      [200, 2482],
      [0, 2485],
    ]),
    frame: smooth([
      [0, -1040],
      [350, -1032],
      [560, -995],
      [700, -800],
      [800, -550],
      [850, -200],
      [858, 300],
      [858, 900],
      [850, 1300],
      [810, 1650],
      [720, 1880],
      [550, 2040],
      [300, 2110],
      [0, 2120],
    ]),
    rail: smooth([
      [580, -960],
      [650, -750],
      [690, -450],
      [690, -335],
      [605, -203],
      [605, 500],
      [600, 1230],
      [555, 1380],
      [540, 1700],
      [490, 1930],
      [330, 2060],
    ]),
    windscreen: smooth([
      [0, -990],
      [300, -982],
      [480, -940],
      [590, -820],
      [640, -650],
      [662, -450],
      corner([640, -335]),
      [0, -330],
    ]),
    roofGlass: [smooth([[0, -203], corner([560, -203]), corner([555, 1230]), [0, 1230]])],
    rearGlass: smooth([[0, 1380], corner([505, 1380]), [495, 1700], [450, 1930], [300, 2040], [0, 2056]]),
    frunk: smooth([
      [807, -1013],
      [808, -1400],
      [800, -1750],
      [740, -1950],
      [560, -2040],
      [300, -2058],
      [0, -2062],
    ]),
    boot: smooth([
      [850, 2120],
      [740, 2320],
      [0, 2410],
    ]),
    creases: [
      smooth([
        [330, -1050],
        [320, -1600],
        [270, -2000],
      ]),
    ],
    doorCuts: [-700, 300, 1290],
    headlight: lamp(80, [520, -2390], [860, -2125]),
    taillight: lamp(64, [0, 2385], [560, 2370], [800, 2230]),
    wipers: parkedWipers(-990, 590, 55),
    mirror: mirror(937, -530, 160, 250),
    wheels: { axles: [-1485, 1475], lengthMm: 740, widthMm: 255, proudMm: 56 },
  },

  /*
   * Model X (2021). 5057 x 1999, wheelbase 2965, front overhang 1030.
   * Two things nothing else on the road has, and both show from above: the panoramic
   * windscreen carries on over the front seats to the B-pillar, so the glass starts near the
   * front axle and runs 1350 mm; and the falcon-wing doors each carry a window in the roof,
   * either side of a painted spine, behind a painted beam where the windscreen ends.
   */
  X: {
    lengthMm: 5057,
    widthMm: 1999,
    wheelbaseMm: 2965,
    frontOverhangMm: 1030,
    body: smooth([
      [0, -2528],
      [382, -2515],
      [606, -2410],
      [789, -2310],
      [880, -2210],
      [944, -2060],
      [981, -1910],
      [986, -1600],
      [984, -1250],
      [962, -1000],
      [955, -700],
      [955, 0],
      [955, 800],
      [979, 950],
      [997, 1100],
      [997, 1700],
      [985, 1850],
      [949, 1950],
      [911, 2100],
      [866, 2250],
      [838, 2300],
      [789, 2350],
      [705, 2400],
      [588, 2450],
      [410, 2500],
      [0, 2528],
    ]),
    frame: smooth([
      [0, -1320],
      [400, -1310],
      [620, -1260],
      [760, -1050],
      [840, -800],
      [880, -500],
      [889, 0],
      [889, 800],
      [885, 1300],
      [870, 1700],
      [820, 2000],
      [700, 2200],
      [500, 2340],
      [250, 2400],
      [0, 2410],
    ]),
    rail: smooth([
      [610, -1230],
      [670, -900],
      [700, -500],
      [700, 50],
      [650, 185],
      [645, 800],
      [645, 1385],
      [650, 1520],
      [630, 1800],
      [580, 2050],
      [360, 2210],
    ]),
    windscreen: smooth([
      [0, -1295],
      [300, -1288],
      [500, -1240],
      [610, -1100],
      [655, -900],
      [672, -600],
      [672, -200],
      [665, 0],
      corner([630, 50]),
      [0, 56],
    ]),
    roofGlass: [],
    falconGlass: smooth(
      [corner([130, 185]), corner([600, 185]), corner([600, 1385]), corner([130, 1385])],
      true,
    ),
    roofPaint: [
      smooth([[0, 60], corner([700, 60]), corner([690, 180]), [0, 180]]),
      smooth([[0, 120], corner([120, 120]), corner([120, 1400]), [0, 1400]]),
      smooth([[0, 1390], corner([700, 1390]), corner([660, 1520]), [0, 1520]]),
    ],
    rearGlass: smooth([[0, 1520], corner([606, 1520]), [590, 1800], [540, 2050], [330, 2190], [0, 2210]]),
    frunk: smooth([
      [937, -922],
      [905, -1350],
      [870, -1750],
      [810, -2057],
      [560, -2160],
      [300, -2195],
      [0, -2200],
    ]),
    boot: smooth([
      [880, 2150],
      [750, 2370],
      [0, 2455],
    ]),
    creases: [
      smooth([
        [330, -1000],
        [310, -1500],
        [270, -2000],
      ]),
    ],
    doorCuts: [-880, 200, 1450],
    headlight: lamp(90, [500, -2350], [900, -1870]),
    taillight: lamp(64, [0, 2430], [560, 2415], [830, 2280]),
    wipers: parkedWipers(-1295, 600, 55),
    mirror: mirror(955, -760, 180, 250),
    wheels: { axles: [-1499, 1466], lengthMm: 760, widthMm: 265, proudMm: 58 },
  },

  /*
   * Cybertruck. 5683 x 2200, wheelbase 3635, front overhang 1000.
   * Straight lines throughout: a blunt front with long chamfers, unpainted trapezoid wheel
   * flares standing proud of the doors and running most of the way from bumper to door, a
   * windscreen the size of a table that starts almost at the bumper, a full-width light bar
   * at each end, and a vault behind the cabin where every other model has a rear screen.
   */
  CT: {
    lengthMm: 5683,
    widthMm: 2200,
    wheelbaseMm: 3635,
    frontOverhangMm: 1000,
    body: polyline([
      [0, -2841],
      [640, -2841],
      [760, -2795],
      [1020, -2560],
      [1100, -2470],
      [1100, -1420],
      [1015, -1350],
      [1015, 1180],
      [1100, 1250],
      [1100, 2270],
      [955, 2320],
      [945, 2780],
      [800, 2841],
      [0, 2841],
    ]),
    frame: polyline([
      [0, -2020],
      [900, -2020],
      [760, -460],
      [730, 830],
      [0, 830],
    ]),
    rail: polyline([
      [860, -1995],
      [740, -488],
      [705, 790],
    ]),
    windscreen: polyline([
      [0, -1995],
      [860, -1995],
      [740, -488],
      [0, -488],
    ]),
    roofGlass: [polyline([[0, -420], [725, -420], [705, 790], [0, 790]])],
    vault: polyline([
      [0, 911],
      [800, 911],
      [810, 2722],
      [0, 2722],
    ]),
    frunk: polyline([
      [1015, -2060],
      [1060, -2450],
      [980, -2640],
      [700, -2760],
      [0, -2775],
    ]),
    boot: polyline([
      [945, 2480],
      [900, 2700],
      [0, 2720],
    ]),
    creases: [line([360, -2100], [330, -2650])],
    doorCuts: [-1500, -250, 800],
    headlight: lamp(70, [0, -2735], [620, -2735], [790, -2680]),
    taillight: lamp(80, [0, 2760], [760, 2760], [900, 2720]),
    // One arm, the length of the glass, parked up the driver's side of the screen.
    wipers: [line([-800, -1950], [-700, -520])],
    // The flares slope out and down from the sail line to the widest point, so from above
    // each is a broad trapezoid, not the sliver that stands proud of the doors.
    flares: [
      polyline([[950, -2620], [1100, -2470], [1100, -1420], [950, -1290]], true),
      polyline([[950, 1120], [1100, 1250], [1100, 2270], [950, 2380]], true),
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
