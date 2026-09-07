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
  /** The three words on the first screen and on the social image. */
  readonly tagline: string;
  /** The page title: a search phrase, not the brand (brief 4.1). */
  readonly title: string;
  readonly description: string;
  /** What the social image shows, for anyone who cannot see it. */
  readonly imageAlt: string;
  readonly disclaimer: string;
} = brand;
