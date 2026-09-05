import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, parseLocale, resolveLocale } from './locale';

describe('parseLocale', () => {
  it('reads the primary subtag and ignores the region', () => {
    expect(parseLocale('fr')).toBe('fr');
    expect(parseLocale('fr-CA')).toBe('fr');
    expect(parseLocale('fr_CA')).toBe('fr');
    expect(parseLocale('FR')).toBe('fr');
    expect(parseLocale(' en-GB ')).toBe('en');
  });

  it('declines rather than guesses, so the caller can try the next source', () => {
    expect(parseLocale('de')).toBeNull();
    expect(parseLocale('')).toBeNull();
    expect(parseLocale('français')).toBeNull();
    expect(parseLocale(null)).toBeNull();
    expect(parseLocale(42)).toBeNull();
  });
});

describe('resolveLocale', () => {
  it('lets a ?lang= link win: following one is the freshest thing the driver has done', () => {
    expect(resolveLocale({ search: '?lang=fr', stored: 'en', preferred: ['en-US'] })).toBe('fr');
    expect(resolveLocale({ search: '?e2e&lang=en', stored: 'fr', preferred: ['fr-FR'] })).toBe(
      'en',
    );
  });

  it('prefers a stored choice over the car, which never chose anything', () => {
    expect(resolveLocale({ stored: 'fr', preferred: ['en-US', 'en'] })).toBe('fr');
  });

  it('falls back to the car browser, best match first', () => {
    expect(resolveLocale({ preferred: ['fr-CH', 'en-US'] })).toBe('fr');
    // A language we do not speak is skipped, not treated as the answer.
    expect(resolveLocale({ preferred: ['de-DE', 'fr-FR'] })).toBe('fr');
  });

  it('lands on English when nothing is known, or when nothing is understood', () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ search: '?lang=de', stored: 'de', preferred: ['de-DE'] })).toBe('en');
    expect(resolveLocale({ search: '', stored: null, preferred: [] })).toBe('en');
  });
});
