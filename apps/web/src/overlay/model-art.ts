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

/**
 * The door mirror: a swept teardrop hung off the door just behind the A-pillar, its leading
 * edge rounded and its trailing edge, where the glass is, nearly straight across.
 */
const mirror = (bodyX: number, y: number, reach = 150, chord = 220, angular = false): Path => {
  const pts: Pt[] = [
    [bodyX - 60, y - chord * 0.5],
    [bodyX + reach * 0.5, y - chord * 0.5],
    [bodyX + reach * 0.95, y - chord * 0.22],
    [bodyX + reach, y + chord * 0.15],
    [bodyX + reach * 0.82, y + chord * 0.45],
    [bodyX + reach * 0.35, y + chord * 0.5],
    [bodyX - 60, y + chord * 0.44],
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
   * Cab-forward saloon with a tapered nose: a windscreen that sits between two nearly
   * straight A-pillars, a roof in two glass panels with a black cross bar between them, and
   * a rear screen that runs to the boot. Slim headlights swept back along the fender
   * corners; C-shaped tail lamps wrapping the rear corners.
   */
  '3': {
    lengthMm: 4720,
    widthMm: 1848,
    wheelbaseMm: 2875,
    frontOverhangMm: 850,
    body: smooth([
      [0, -2360],
      [300, -2350],
      [480, -2320],
      [620, -2260],
      [730, -2170],
      [815, -2050],
      [875, -1900],
      [908, -1700],
      [920, -1400],
      [918, -1000],
      [910, -600],
      [906, 0],
      [908, 600],
      [916, 1000],
      [924, 1400],
      [918, 1700],
      [892, 1900],
      [840, 2050],
      [765, 2170],
      [655, 2260],
      [480, 2320],
      [280, 2350],
      [0, 2360],
    ]),
    frame: smooth([
      [0, -1215],
      [350, -1205],
      [560, -1160],
      [720, -1030],
      [770, -800],
      [785, -400],
      [785, 300],
      [780, 900],
      [770, 1300],
      [745, 1550],
      [700, 1700],
      [610, 1810],
      [400, 1868],
      [0, 1878],
    ]),
    rail: smooth([
      [710, -1010],
      [705, -700],
      [695, -400],
      [680, -240],
      [668, -100],
      [668, 500],
      [665, 1000],
      [640, 1400],
      [600, 1600],
      [530, 1730],
    ]),
    windscreen: smooth([
      [0, -1170],
      [350, -1160],
      [560, -1108],
      corner([690, -1000]),
      [688, -700],
      [670, -400],
      corner([640, -240]),
      [350, -236],
      [0, -234],
    ]),
    roofGlass: [
      smooth([[0, -150], corner([635, -150]), corner([635, 470]), [0, 470]]),
      smooth([[0, 580], corner([635, 580]), [630, 1000], [600, 1400], [560, 1620], [480, 1750], [330, 1815], [0, 1825]]),
    ],
    roofBar: { y: 525, heightMm: 70 },
    frunk: smooth([
      [820, -1000],
      [812, -1400],
      [780, -1750],
      [700, -1990],
      [560, -2140],
      [350, -2230],
      [0, -2250],
    ]),
    boot: smooth([
      [840, 1990],
      [770, 2150],
      [600, 2260],
      [0, 2300],
    ]),
    creases: [
      smooth([
        [430, -1100],
        [380, -1600],
        [300, -2000],
        [220, -2200],
      ]),
    ],
    doorCuts: [-980, 120, 1060],
    headlight: lamp(70, [520, -2290], [830, -1990]),
    taillight: lamp(70, [880, 1900], [790, 2120], [600, 2245], [420, 2285]),
    wipers: parkedWipers(-1170, 690, 170),
    mirror: mirror(918, -780, 150, 220),
    wheels: { axles: [-1510, 1365], lengthMm: 700, widthMm: 245, proudMm: 66 },
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
      [320, -2385],
      [520, -2350],
      [660, -2290],
      [770, -2190],
      [850, -2060],
      [905, -1900],
      [935, -1700],
      [948, -1400],
      [940, -1000],
      [925, -600],
      [918, 0],
      [920, 600],
      [935, 1000],
      [960, 1400],
      [952, 1700],
      [925, 1900],
      [895, 2050],
      [845, 2170],
      [765, 2260],
      [620, 2330],
      [380, 2385],
      [0, 2396],
    ]),
    frame: smooth([
      [0, -1230],
      [350, -1220],
      [580, -1170],
      [740, -1050],
      [795, -800],
      [815, -400],
      [818, 300],
      [818, 900],
      [812, 1400],
      [800, 1750],
      [760, 1950],
      [660, 2090],
      [460, 2170],
      [0, 2195],
    ]),
    rail: smooth([
      [710, -1040],
      [700, -700],
      [688, -345],
      [672, -245],
      [665, 600],
      [660, 1250],
      [640, 1400],
      [620, 1600],
      [590, 1850],
      [530, 2010],
    ]),
    windscreen: smooth([
      [0, -1200],
      [350, -1190],
      [560, -1135],
      corner([690, -1030]),
      [688, -700],
      [672, -450],
      corner([645, -345]),
      [350, -340],
      [0, -338],
    ]),
    roofGlass: [smooth([[0, -245], corner([640, -245]), corner([630, 1250]), [0, 1250]])],
    roofPaint: [smooth([[0, 1290], corner([690, 1290]), corner([660, 1560]), [0, 1560]])],
    rearGlass: smooth([[0, 1600], corner([560, 1600]), [545, 1850], [480, 2030], [300, 2140], [0, 2150]]),
    frunk: smooth([
      [830, -1060],
      [830, -1450],
      [800, -1800],
      [730, -2020],
      [580, -2180],
      [350, -2270],
      [0, -2290],
    ]),
    boot: smooth([
      [830, 2130],
      [700, 2250],
      [450, 2330],
      [0, 2350],
    ]),
    creases: [
      smooth([
        [420, -1150],
        [380, -1650],
        [300, -2050],
        [220, -2230],
      ]),
    ],
    doorCuts: [-1000, 200, 1100],
    headlight: lamp(55, [0, -2330], [500, -2300], [760, -2170]),
    taillight: lamp(70, [0, 2320], [500, 2305], [790, 2170]),
    wipers: parkedWipers(-1200, 690, 170),
    mirror: mirror(940, -790, 150, 225),
    wheels: { axles: [-1526, 1364], lengthMm: 720, widthMm: 255, proudMm: 66 },
  },

  /*
   * Model S (2021). 4970 x 1964, wheelbase 2960, front overhang 1000.
   * The long one: a pointed nose, a bonnet that ends short of the tip where the front fascia
   * takes over, slim horizontal headlights, a fastback whose rear screen runs most of the
   * way to the tail, and a full-width light bar.
   */
  S: {
    lengthMm: 4970,
    widthMm: 1964,
    wheelbaseMm: 2960,
    frontOverhangMm: 1000,
    body: smooth([
      [0, -2485],
      [300, -2475],
      [520, -2440],
      [680, -2370],
      [790, -2270],
      [860, -2140],
      [910, -2000],
      [945, -1800],
      [962, -1500],
      [960, -1200],
      [948, -800],
      [940, -400],
      [940, 0],
      [945, 500],
      [958, 900],
      [975, 1200],
      [982, 1500],
      [970, 1750],
      [935, 1950],
      [890, 2100],
      [830, 2220],
      [740, 2320],
      [600, 2400],
      [380, 2455],
      [0, 2485],
    ]),
    frame: smooth([
      [0, -1060],
      [350, -1050],
      [560, -1000],
      [740, -880],
      [800, -650],
      [815, -200],
      [815, 400],
      [812, 1000],
      [800, 1400],
      [770, 1700],
      [700, 1900],
      [560, 2050],
      [350, 2120],
      [0, 2130],
    ]),
    rail: smooth([
      [710, -870],
      [700, -600],
      [688, -330],
      [670, -230],
      [665, 600],
      [660, 1220],
      [640, 1350],
      [625, 1650],
      [570, 1860],
    ]),
    windscreen: smooth([
      [0, -1030],
      [350, -1020],
      [560, -965],
      corner([690, -860]),
      [688, -600],
      [672, -420],
      corner([645, -330]),
      [350, -326],
      [0, -324],
    ]),
    roofGlass: [smooth([[0, -230], corner([640, -230]), corner([635, 1220]), [0, 1220]])],
    rearGlass: smooth([[0, 1350], corner([600, 1350]), [590, 1650], [520, 1880], [350, 2040], [0, 2055]]),
    frunk: smooth([
      [850, -870],
      [850, -1400],
      [820, -1800],
      [750, -2050],
      [560, -2190],
      [300, -2255],
      [0, -2265],
    ]),
    boot: smooth([
      [860, 2120],
      [740, 2320],
      [0, 2410],
    ]),
    creases: [
      smooth([
        [430, -950],
        [400, -1500],
        [320, -1950],
        [240, -2180],
      ]),
    ],
    doorCuts: [-850, 350, 1250],
    headlight: lamp(75, [560, -2380], [880, -2090]),
    taillight: lamp(60, [0, 2395], [560, 2380], [820, 2230]),
    wipers: parkedWipers(-1030, 690, 170),
    mirror: mirror(948, -650, 150, 225),
    wheels: { axles: [-1485, 1475], lengthMm: 740, widthMm: 255, proudMm: 66 },
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
      [340, -2515],
      [560, -2470],
      [700, -2390],
      [810, -2280],
      [890, -2140],
      [945, -1980],
      [975, -1800],
      [990, -1500],
      [975, -1100],
      [958, -700],
      [955, 0],
      [960, 600],
      [985, 1000],
      [999, 1400],
      [994, 1700],
      [965, 1900],
      [920, 2100],
      [865, 2250],
      [780, 2370],
      [640, 2450],
      [400, 2505],
      [0, 2528],
    ]),
    frame: smooth([
      [0, -1340],
      [350, -1330],
      [580, -1275],
      [760, -1140],
      [820, -800],
      [845, -300],
      [850, 300],
      [850, 900],
      [845, 1400],
      [830, 1800],
      [780, 2050],
      [680, 2230],
      [480, 2360],
      [250, 2405],
      [0, 2415],
    ]),
    rail: smooth([
      [720, -1120],
      [720, -700],
      [715, -200],
      [710, 20],
      [700, 175],
      [680, 700],
      [670, 1390],
      [665, 1545],
      [650, 1820],
      [600, 2040],
    ]),
    windscreen: smooth([
      [0, -1300],
      [350, -1290],
      [560, -1235],
      corner([700, -1120]),
      [705, -700],
      [700, -200],
      corner([690, 20]),
      [350, 26],
      [0, 28],
    ]),
    roofGlass: [],
    falconGlass: smooth(
      [corner([120, 190]), corner([640, 190]), corner([640, 1390]), corner([120, 1390])],
      true,
    ),
    roofPaint: [
      smooth([[0, 35], corner([715, 35]), corner([705, 180]), [0, 180]]),
      smooth([[0, 150], corner([110, 150]), corner([110, 1420]), [0, 1420]]),
      smooth([[0, 1400], corner([715, 1400]), corner([690, 1540]), [0, 1540]]),
    ],
    rearGlass: smooth([[0, 1545], corner([640, 1545]), [620, 1820], [560, 2060], [350, 2200], [0, 2220]]),
    frunk: smooth([
      [880, -1130],
      [870, -1500],
      [840, -1850],
      [770, -2100],
      [600, -2250],
      [330, -2320],
      [0, -2335],
    ]),
    boot: smooth([
      [890, 2150],
      [750, 2370],
      [0, 2455],
    ]),
    creases: [
      smooth([
        [430, -1200],
        [390, -1650],
        [310, -2050],
        [230, -2260],
      ]),
    ],
    doorCuts: [-1050, 170, 1450],
    headlight: lamp(80, [520, -2400], [890, -2030]),
    taillight: lamp(60, [0, 2445], [560, 2430], [840, 2290]),
    wipers: parkedWipers(-1300, 700, 180),
    mirror: mirror(972, -880, 165, 230),
    wheels: { axles: [-1499, 1466], lengthMm: 760, widthMm: 265, proudMm: 68 },
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
      [0, -2030],
      [910, -2030],
      [775, -470],
      [755, 840],
      [0, 840],
    ]),
    rail: polyline([
      [870, -2000],
      [750, -490],
      [720, 800],
    ]),
    windscreen: polyline([
      [0, -1995],
      [850, -1995],
      [735, -500],
      [0, -500],
    ]),
    roofGlass: [polyline([[0, -430], [720, -430], [700, 800], [0, 800]])],
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
    mirror: mirror(1015, -1350, 180, 220, true),
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
