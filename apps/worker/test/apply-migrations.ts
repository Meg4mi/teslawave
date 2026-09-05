import { env } from 'cloudflare:test';
// The real migration files, imported as text: the worker sandbox has no host filesystem.
import pairing from '../migrations/0001_pairing.sql?raw';
import hubs from '../migrations/0002_hubs.sql?raw';

const MIGRATIONS = [pairing, hubs];

/** Apply the D1 migrations into the test database, in order. */
export async function applyMigrations(): Promise<void> {
  for (const schema of MIGRATIONS)
    for (const statement of schema.replace(/^\s*--.*$/gm, '').split(';')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) await env.DB.prepare(trimmed).run();
    }
}
