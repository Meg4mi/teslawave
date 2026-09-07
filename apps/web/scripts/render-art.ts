/**
 * Development only: render every model as SVG, at hero size and at map size, and screenshot
 * the sheet, so a change to the drawing can be judged from a picture.
 *
 *   pnpm art out.png [colour|all] [size]        (from apps/web)
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { CAR_COLOURS, TESLA_MODELS } from '@teslawave/protocol';
import { buildCarScene, showsFineDetail, type Paint, type Scene } from '../src/overlay/car-scene';

const [out = 'art.png', colour = 'pearl', size = '520', bg = '#0e1319'] = process.argv.slice(2);

export function sceneToSvg(scene: Scene, sizePx: number, heading = 0, idp = 'a'): string {
  const defs: string[] = [];
  const paintRef = (paint: Paint, key: string): string => {
    if (typeof paint === 'string') return paint;
    const gid = `${idp}-g${key}`;
    defs.push(
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${paint.from[0]}" y1="${paint.from[1]}" x2="${paint.to[0]}" y2="${paint.to[1]}">` +
        paint.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') +
        `</linearGradient>`,
    );
    return `url(#${gid})`;
  };
  for (const [name, d] of Object.entries(scene.clips)) defs.push(`<clipPath id="${idp}-c-${name}"><path d="${d}"/></clipPath>`);
  const els: string[] = [];
  const fine = showsFineDetail(sizePx);
  scene.ops.forEach((op, i) => {
    if (op.fine && !fine) return;
    const paint = paintRef(op.paint, String(i));
    const common = `${op.clip ? ` clip-path="url(#${idp}-c-${op.clip})"` : ''}${op.alpha !== undefined ? ` opacity="${op.alpha}"` : ''}`;
    const shape =
      op.kind === 'fill'
        ? `d="${op.d}" fill="${paint}"`
        : `d="${op.d}" fill="none" stroke="${paint}" stroke-width="${op.width}" stroke-linecap="${op.cap ?? 'butt'}" stroke-linejoin="round"`;
    const t = op.kind === 'fill' && op.offset ? `translate(${op.offset[0]} ${op.offset[1]})` : '';
    els.push(`<path${common} ${shape}${t ? ` transform="${t}"` : ''}/>`);
    if (op.mirror) els.push(`<path${common} ${shape} transform="scale(-1 1)${t ? ` ${t}` : ''}"/>`);
  });
  const pad = 140;
  const long = scene.lengthMm + pad * 2;
  const short = scene.halfWidthMm * 2 + pad * 2;
  const turn = ((heading % 180) + 180) % 180;
  const [w, h] = turn === 0 ? [short, long] : turn === 90 ? [long, short] : [long, long];
  const px = sizePx / long;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${w * px}" height="${h * px}"><defs>${defs.join('')}</defs><g${heading ? ` transform="rotate(${heading})"` : ''}>${els.join('')}</g></svg>`;
}

let n = 0;
const car = (model: (typeof TESLA_MODELS)[number], c: string, s: number, heading = 0): string =>
  sceneToSvg(buildCarScene(model, c), s, heading, `s${n++}`);

const colours = colour === 'all' ? CAR_COLOURS.map((c) => c.id) : colour.split(',');
let html = `<html><body style="margin:0;background:${bg};padding:24px;font:14px system-ui;color:#9aa">`;
for (const c of colours) {
  html += `<div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:20px">`;
  for (const m of TESLA_MODELS)
    html += `<div style="display:grid;gap:10px;justify-items:center">${car(m, c, Number(size))}<div style="display:flex;gap:10px;align-items:center">${car(m, c, 58)}${car(m, c, 46)}${car(m, c, 28)}</div><div>${m} · ${c}</div></div>`;
  html += `</div>`;
}
html += `</body></html>`;
writeFileSync(out.replace(/\.png$/, '.html'), html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
