import { colourOf, type TeslaModel } from '@teslawave/protocol';
import { buildCarScene } from '../overlay/car-scene';
import { paintScene } from '../overlay/sprites';

/**
 * Your car and your wave count, drawn as one image you can send to people.
 *
 * The growth loop for a product like this is owner groups, and what travels in an owner group
 * is a picture, not a link. This is the smallest honest version of that: the car you chose,
 * the number of nods you have exchanged, and the domain. No map, no route, no place, no time,
 * nothing about anyone else — a trip card is a v2 item and would put a place in an image
 * people forward (brief 9).
 *
 * It is the same drawing as the sprite and the same drawing as the picker, through the same
 * scene (ADR-0020), so the car in the image is the car on the map.
 */

/**
 * Roughly 1.91:1, the shape every messenger and social preview crops to.
 *
 * Deliberately not the other common size for that ratio: `check:css` bans the literals of the
 * car screen's resolution across the whole client, because 2026.26 changed the browser's
 * pixel density and hardcoding it is what broke other apps. A card is a fixed-size drawing
 * and not a screen, but the rule is worth more than the twenty pixels an argument would win.
 */
export const CARD_W = 1080;
export const CARD_H = 566;

const BG = '#08090b';
const FG = '#f2f4f7';
const DIM = '#9da2aa';
const ACCENT = '#6ee7ff';
const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type ShareCardContent = {
  model: TeslaModel;
  colour: string;
  /** The big line: the count and its noun, already in the driver's language. */
  headline: string;
  /** One quiet line under it. */
  sub: string;
  brand: string;
  domain: string;
  disclaimer: string;
};

/** The car, at the size and place the layout wants it, from the shared scene. */
function drawCar(ctx: CanvasRenderingContext2D, content: ShareCardContent): void {
  const scene = buildCarScene(content.model, content.colour);
  const lengthPx = 470;
  const scale = lengthPx / scene.lengthMm;
  const cx = CARD_W / 2;
  const cy = 232;

  // The floor: a pool of light the car sits in, as on the first screen. A gradient, not a
  // blur — nothing here may use a filter, and the same drawing runs on an Intel Atom.
  const floor = ctx.createRadialGradient(cx, cy + 26, 10, cx, cy + 26, lengthPx * 0.62);
  floor.addColorStop(0, 'rgba(110, 231, 255, 0.12)');
  floor.addColorStop(0.55, 'rgba(110, 231, 255, 0.04)');
  floor.addColorStop(1, 'rgba(110, 231, 255, 0)');
  ctx.save();
  ctx.translate(cx, cy + 26);
  ctx.scale(1, 0.42);
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.arc(0, 0, lengthPx * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  // Nose to the right, the way the car sits on the picker and in every card in the app.
  ctx.rotate(Math.PI / 2);
  ctx.scale(scale, scale);
  paintScene(ctx, scene, scale);
  ctx.restore();
}

/**
 * Draw the whole card into a canvas. Sized in CSS pixels; pass a `scale` above 1 for a
 * sharper file on a dense screen.
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  content: ShareCardContent,
  scale = 2,
): void {
  canvas.width = Math.round(CARD_W * scale);
  canvas.height = Math.round(CARD_H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const ground = ctx.createLinearGradient(0, 0, 0, CARD_H);
  ground.addColorStop(0, '#0e1319');
  ground.addColorStop(1, BG);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = DIM;
  ctx.font = `600 15px ${FONT}`;
  // Letter spacing by hand: `ctx.letterSpacing` is recent and not everywhere yet, and this
  // one string is the only place the card needs it.
  let x = 64;
  for (const ch of content.brand.toUpperCase()) {
    ctx.fillText(ch, x, 74);
    x += ctx.measureText(ch).width + 3.6;
  }

  drawCar(ctx, content);

  ctx.textAlign = 'center';
  ctx.fillStyle = FG;
  ctx.font = `600 58px ${FONT}`;
  ctx.fillText(content.headline, CARD_W / 2, 416, CARD_W - 128);

  ctx.fillStyle = DIM;
  ctx.font = `450 22px ${FONT}`;
  ctx.fillText(content.sub, CARD_W / 2, 456, CARD_W - 128);

  ctx.fillStyle = ACCENT;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(content.domain, CARD_W / 2, 506, CARD_W - 128);

  // Required on every surface the brand appears on, this one included.
  ctx.fillStyle = 'rgba(157, 162, 170, 0.7)';
  ctx.font = `450 12px ${FONT}`;
  ctx.fillText(content.disclaimer, CARD_W / 2, 540, CARD_W - 96);
  ctx.textAlign = 'left';

  void colourOf(content.colour);
}

export const cardBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });

/** What this browser can actually do with the image, decided once rather than guessed at. */
export type ShareAbility = 'share' | 'download' | 'none';

export function shareAbility(file: File): ShareAbility {
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  try {
    if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] }))
      return 'share';
  } catch {
    // Some browsers throw from canShare rather than answering it.
  }
  // The car browser can do neither, which is why the card is on screen either way: a
  // passenger can photograph it, and the phone this driver paired from can send it properly.
  return typeof document.createElement('a').download === 'string' ? 'download' : 'none';
}
