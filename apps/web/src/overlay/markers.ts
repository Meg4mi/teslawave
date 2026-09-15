import type { ReportKind } from '@teslawave/protocol';

/**
 * The pin a report is drawn as: a disc in its own colour with a glyph, baked once per
 * (kind, dpr) exactly as car sprites are, so a frame with a pin on it costs one drawImage.
 *
 * Colour is rationed on this screen (cyan is you, warm is a wave), so a report gets the one
 * colour left that means "mind this": the danger red of the tokens for an accident, and a
 * cool blue nobody else uses for the police. Neither is the accent, so a pin never reads as
 * a car you could wave at.
 */
export const MARKER_PX = 40;
const PAD = 10;

export const MARKER_COLOUR: Record<ReportKind, string> = {
  police: '#7aa2ff',
  accident: '#ff8b8b',
};

export type Marker = { canvas: HTMLCanvasElement; size: number; dpr: number };

const cache = new Map<string, Marker>();

export function getMarker(kind: ReportKind, dpr: number): Marker {
  const key = `${kind}|${dpr}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = MARKER_PX + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(size * dpr);
  canvas.height = Math.ceil(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, size, dpr };

  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  const colour = MARKER_COLOUR[kind];
  const r = MARKER_PX / 2;

  // A soft halo, baked: the only glow a pin gets, and it costs nothing per frame.
  const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, size / 2);
  glow.addColorStop(0, `${colour}40`);
  glow.addColorStop(1, `${colour}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // The disc: dark ground, a coloured rim, so the glyph reads on any road.
  ctx.fillStyle = '#0f1013';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'police') {
    // A badge: a shield outline, the shape every road sign uses for a patrol.
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -9.5);
    ctx.lineTo(8.5, -6);
    ctx.quadraticCurveTo(8.5, 5, 0, 10);
    ctx.quadraticCurveTo(-8.5, 5, -8.5, -6);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A warning triangle with its mark.
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10.5, 8);
    ctx.lineTo(-10.5, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 5.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const marker = { canvas, size, dpr };
  cache.set(key, marker);
  return marker;
}

export function clearMarkerCache(): void {
  cache.clear();
}
