import type { HubDO } from './hub-do.js';

declare global {
  namespace Cloudflare {
    interface Env {
      HUB: DurableObjectNamespace<HubDO>;
      ASSETS: Fetcher;
      DB: D1Database;
      WS_ENABLED: string;
      TEST_MODE: string;
    }
  }
  type Env = Cloudflare.Env;
}

export {};
