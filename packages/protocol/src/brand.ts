import brand from './brand.json';

/**
 * The only place the brand exists: a rebrand is a one-file change (brief 1).
 * It is JSON so the Vite config can read it without loading the TypeScript sources.
 * Never use Tesla's logo, wordmark styling, or the "T" mark.
 */
export const BRAND: {
  readonly name: string;
  readonly domain: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly disclaimer: string;
} = brand;
