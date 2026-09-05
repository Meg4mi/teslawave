/**
 * Which language the app speaks. A driver should never have to go looking for this: the car
 * browser already knows, so the app reads it and gets out of the way. It stays steerable
 * though — `?lang=fr` makes a shared link land in a known language, and a choice made by
 * hand outlives the guess.
 */
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Not a preference, a floor: the language shown when nothing else is known. */
export const DEFAULT_LOCALE: Locale = 'en';

/** A language is always offered in its own words. An endonym is never translated. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

/** Two characters, for the switcher in the settings sheet. */
export const LOCALE_SHORT: Record<Locale, string> = { en: 'EN', fr: 'FR' };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * "fr", "fr-CA", "FR" and "fr_CA" all mean French: only the primary subtag decides. A
 * language we do not speak returns null rather than a wrong guess, so the caller can fall
 * through to the next source instead of settling.
 */
export function parseLocale(tag: unknown): Locale | null {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(primary) ? primary : null;
}

export type LocaleSources = {
  /** A query string, `?lang=fr` and all. */
  readonly search?: string | undefined;
  /** What was chosen by hand on this device last time, if anything. */
  readonly stored?: string | null | undefined;
  /** `navigator.languages`, best first. */
  readonly preferred?: readonly string[] | undefined;
};

/**
 * The order is the point. A `?lang=` link is the freshest intent there is, so it outranks a
 * stored choice made months ago; after that comes what the driver picked here before; only
 * then the car's own language list, which is a guess about them rather than a statement by
 * them. Every source can decline, and the last word is English.
 */
export function resolveLocale({ search, stored, preferred }: LocaleSources): Locale {
  const asked = parseLocale(new URLSearchParams(search ?? '').get('lang'));
  if (asked) return asked;
  const chosen = parseLocale(stored);
  if (chosen) return chosen;
  for (const tag of preferred ?? []) {
    const spoken = parseLocale(tag);
    if (spoken) return spoken;
  }
  return DEFAULT_LOCALE;
}
