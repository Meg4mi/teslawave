#!/usr/bin/env node
/**
 * Make sure the D1 database exists and that wrangler.jsonc points at it.
 *
 * The database id is not a secret (reaching it still needs a token), but it is account
 * specific, so the first deploy has to discover it. This is idempotent: it creates the
 * database only when it is missing, and with --write it patches the config in place.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/ensure-d1.mjs --write
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'teslawave';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = join(root, 'apps', 'worker', 'wrangler.jsonc');
const write = process.argv.includes('--write');

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.');
  process.exit(2);
}

const wrangler = (...args) =>
  execFileSync('pnpm', ['--filter', '@teslawave/worker', 'exec', 'wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

/** `wrangler d1 list --json` has used both `uuid` and `database_id` over time. */
const findId = () => {
  const raw = wrangler('d1', 'list', '--json');
  const start = raw.indexOf('[');
  if (start < 0) return null;
  const databases = JSON.parse(raw.slice(start));
  const found = databases.find((db) => db.name === NAME);
  return found ? (found.uuid ?? found.database_id ?? null) : null;
};

let id = findId();
if (id) {
  console.log(`D1 database ${NAME} already exists: ${id}`);
} else {
  console.log(`Creating D1 database ${NAME}...`);
  wrangler('d1', 'create', NAME);
  id = findId();
  if (!id) {
    console.error(`Created ${NAME} but could not read its id back.`);
    process.exit(1);
  }
  console.log(`Created: ${id}`);
}

if (write) {
  const before = readFileSync(config, 'utf8');
  const after = before.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${id}$2`);
  if (after === before && !before.includes(id)) {
    console.error('Could not find a database_id field to patch in wrangler.jsonc.');
    process.exit(1);
  }
  if (after !== before) {
    writeFileSync(config, after);
    console.log(`Wrote the id into ${config}`);
  }
}

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_OUTPUT, `database_id=${id}\n`);
}
