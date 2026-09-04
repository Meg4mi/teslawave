import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { TEST_MODE: 'true' },
        d1Databases: ['DB'],
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
