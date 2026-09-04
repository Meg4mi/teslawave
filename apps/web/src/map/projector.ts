import type { Map as MlMap } from 'maplibre-gl';
import type { Project } from '../overlay/renderer';

/**
 * Longitude and latitude to screen pixels, cheaply enough to do it a thousand times a frame.
 *
 * `map.project` is correct and general, and it is also a matrix multiply through MapLibre's
 * transform with a `Point` allocated per call. The overlay projects every car, every trail
 * point and every ring anchor every frame: with twenty cars and thirty seconds of trail that
 * is over a thousand calls, which on an Intel Atom is a visible share of the budget.
 *
 * The map here is flat — pitch is disabled — so its projection is an affine map of Web
 * Mercator coordinates: a rotation for the bearing, a scale for the zoom, a translation for
 * the centre. Three real projections per frame recover that affine map exactly, and every
 * point after that is a handful of multiplications. A fourth projection checks the result,
 * so if the map is ever put into a mode where this stops being true (pitch, globe) the
 * overlay falls back to `map.project` rather than drawing cars in the wrong place.
 */
const MAX_LAT = 85.051129;
const EPS = 1e-5;
/** Half a pixel: below this nobody can see the difference; above it, something is off. */
const TOLERANCE_PX = 0.5;

const mercX = (lng: number): number => (lng + 180) / 360;
const mercY = (lat: number): number => {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const fromMerc = (x: number, y: number): [number, number] => [
  x * 360 - 180,
  ((2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) * 180) / Math.PI,
];

export function affineProjector(map: MlMap): Project {
  const centre = map.getCenter();
  const cx = mercX(centre.lng);
  const cy = mercY(centre.lat);
  const origin = map.project([centre.lng, centre.lat]);
  const alongX = map.project(fromMerc(cx + EPS, cy));
  const alongY = map.project(fromMerc(cx, cy + EPS));
  const ax = (alongX.x - origin.x) / EPS;
  const ay = (alongX.y - origin.y) / EPS;
  const bx = (alongY.x - origin.x) / EPS;
  const by = (alongY.y - origin.y) / EPS;
  const ox = origin.x;
  const oy = origin.y;

  const fast: Project = (lng, lat) => {
    const dx = mercX(lng) - cx;
    const dy = mercY(lat) - cy;
    return { x: ox + ax * dx + bx * dy, y: oy + ay * dx + by * dy };
  };

  // Verify on a point off both axes, where a non-affine transform would show.
  const [checkLng, checkLat] = fromMerc(cx - EPS * 3, cy + EPS * 2);
  const expected = map.project([checkLng, checkLat]);
  const got = fast(checkLng, checkLat);
  if (Math.abs(got.x - expected.x) > TOLERANCE_PX || Math.abs(got.y - expected.y) > TOLERANCE_PX)
    return (lng, lat) => map.project([lng, lat]);
  return fast;
}
