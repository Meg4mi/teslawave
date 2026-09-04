#!/usr/bin/env node
/**
 * The MCU 2 rendering constraints from the brief, as a build step.
 *
 * On an Intel Atom a blur or an animated shadow is not a slightly slower frame, it is a
 * dropped one. Transform and opacity are composited; everything else is not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');

/** Comments talk about the rules; only code has to obey them. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '');

const CSS_RULES = [
  {
    name: 'filter / backdrop-filter',
    re: /(^|[\s;{])(backdrop-)?filter\s*:/,
    why: 'banned on MCU 2: bake the effect into a sprite or a static texture instead',
  },
  { name: 'blur()', re: /\bblur\s*\(/, why: 'banned on MCU 2: use a pre-baked texture' },
  {
    name: 'animated box-shadow',
    re: /transition\s*:[^;]*box-shadow/,
    why: 'shadows repaint every frame: animate transform or opacity',
  },
];

const CODE_RULES = [
  {
    name: 'canvas shadowBlur',
    re: /\.shadowBlur\s*=|shadowBlur\s*:/,
    why: 'canvas shadows are per-draw blurs: bake the glow into the sprite bitmap',
  },
  {
    name: 'CSS filter set from code',
    re: /style\.(webkit)?[Ff]ilter\s*=|['"]?(backdrop-?[Ff]ilter|filter)['"]?\s*:\s*['"`][^'"`]*(blur|drop-shadow)/,
    why: 'banned on MCU 2: bake the effect instead',
  },
];

const SHARED_RULES = [
  {
    name: 'hardcoded screen size',
    re: /(^|[^\w.$-])(1920|1200)(px)?([^\w%]|$)/,
    why: '2026.26 changed the car browser pixel density: use viewport units and devicePixelRatio',
  },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

let failures = 0;
let scanned = 0;

for (const file of walk(root)) {
  const ext = extname(file);
  if (!['.css', '.ts', '.tsx'].includes(ext)) continue;
  scanned++;
  const rules = [...(ext === '.css' ? CSS_RULES : CODE_RULES), ...SHARED_RULES];
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    // A line may opt out with `css-check-ok`, but the reason has to be written next to it.
    if (line.includes('css-check-ok')) return;
    for (const rule of rules) {
      if (!rule.re.test(line)) continue;
      console.error(`${file}:${i + 1}  ${rule.name} — ${rule.why}`);
      console.error(`  ${line.trim()}`);
      failures++;
    }
  });
}

if (failures > 0) {
  console.error(`\n${failures} rendering-budget violation(s) in ${scanned} files.`);
  process.exit(1);
}
console.log(
  `Rendering budget clean across ${scanned} files: no blur, no animated shadows, no hardcoded screen size.`,
);
