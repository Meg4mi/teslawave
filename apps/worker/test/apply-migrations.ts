import { env } from 'cloudflare:test';
// The real migration file, imported as text: the worker sandbox has no host filesystem.
import schema from '../migrations/0001_pairing.sql?raw';

/** Apply the D1 migrations into the test database. */
export async function applyMigrations(): Promise<void> {
  for (const statement of schema.split(';')) {
    const trimmed = statement.trim();
    if (trimmed.length > 0) await env.DB.prepare(trimmed).run();
  }
}
