#!/usr/bin/env node
/**
 * Generates the static textures the design system needs, so nothing is blurred at runtime:
 * a tiled noise PNG (stands in for frosted glass) and the OG image.
 *
 * Pure Node, no dependencies: both are written as raw PNGs.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'apps', 'web', 'public');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** @param {(x:number,y:number)=>[number,number,number,number]} pixel */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });

// Tiled noise: what gives sheets texture without a backdrop-filter.
let seed = 1337;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
writeFileSync(
  join(out, 'noise.png'),
  png(160, 160, () => {
    const v = Math.round(rand() * 255);
    return [v, v, v, 10];
  }),
);

// OG image: dark ground, a cyan sweep, no text (text is drawn by the social card renderer
// from the page title, and a wrong-font PNG ages badly).
const W = 1200;
const H = 630;
writeFileSync(
  join(out, 'og.png'),
  png(W, H, (x, y) => {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    const ring = Math.exp(-((d - 0.55) ** 2) / 0.006) * 0.55 + Math.exp(-((d - 0.34) ** 2) / 0.004) * 0.35;
    const base = [7, 9, 12];
    const accent = [110, 231, 255];
    const k = Math.min(1, ring);
    return [
      Math.round(base[0] + (accent[0] - base[0]) * k),
      Math.round(base[1] + (accent[1] - base[1]) * k),
      Math.round(base[2] + (accent[2] - base[2]) * k),
      255,
    ];
  }),
);

console.log('wrote noise.png and og.png');
