import { describe, expect, it } from 'vitest';
import {
  BRAND,
  CAR_COLOURS,
  TESLA_MODELS,
  WAVE_MILESTONES,
  describeCar,
  type TeslaModel,
} from '@teslawave/protocol';
import { EN } from './copy.en';
import { FR } from './copy.fr';
import { CATALOGUES } from './store';
import { LOCALES, type Locale } from './locale';

/**
 * The shape of a catalogue, with every leaf replaced by its kind. Comparing two of these
 * catches what the compiler cannot: `milestones` is a Record, so TypeScript is happy with a
 * language that celebrates a different set of numbers, and a list of steps that is a step
 * shorter in one language renders as a list with a hole in it.
 */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (Array.isArray(value)) return { array: value.length };
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shape(inner)]),
    );
  return typeof value;
}

const everyLocale = LOCALES.map((locale): [Locale, (typeof CATALOGUES)[Locale]] => [
  locale,
  CATALOGUES[locale],
]);

describe('catalogues', () => {
  it.each(everyLocale)('%s says everything English says', (_locale, copy) => {
    expect(shape(copy)).toEqual(shape(EN));
  });

  it.each(everyLocale)('%s speaks like an owner: short, warm, never shouting', (_locale, copy) => {
    const strings = JSON.stringify(copy);
    expect(strings).not.toContain('!');
    // No emoji in chrome (brief 7).
    expect(strings).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it.each(everyLocale)('%s celebrates exactly the milestones the protocol has', (_locale, copy) => {
    expect(
      Object.keys(copy.milestones)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...WAVE_MILESTONES]);
  });

  it.each(everyLocale)('%s names every paint in the palette, distinctly', (_locale, copy) => {
    const labels = CAR_COLOURS.map((c) => copy.cars.colour(c.id));
    expect(labels).toHaveLength(CAR_COLOURS.length);
    expect(new Set(labels).size).toBe(CAR_COLOURS.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  });

  it.each(everyLocale)('%s carries the brand untranslated and a disclaimer', (_locale, copy) => {
    expect(copy.brand).toBe(BRAND.name);
    // Required on every screen (brief 1), so it may never be blank in any language.
    expect(copy.disclaimer).toContain('Tesla, Inc.');
  });
});

describe('English', () => {
  it('carries the disclaimer verbatim from the one place it is defined', () => {
    expect(EN.disclaimer).toBe(BRAND.disclaimer);
  });

  /* Wiring the copy through the catalogue must not have quietly reworded a single car. */
  it('names every car exactly as it did before the catalogue existed', () => {
    for (const model of TESLA_MODELS) {
      for (const colour of CAR_COLOURS) {
        expect(EN.cars.describe(model, colour.id)).toBe(describeCar(model, colour.id));
      }
    }
  });

  it('names a car the way a driver would', () => {
    expect(EN.wave.prompt('Y', 'deepblue')).toBe('Wave at the blue Model Y');
    expect(EN.wave.received('3', 'ultrared')).toBe('A red Model 3 waved at you');
    // A name takes no article: it is who they are, not what they are driving.
    expect(EN.wave.promptTargetNamed('Ghost')).toBe('at Ghost');
  });

  it('keeps the last-wave label glanceable', () => {
    const now = 1_700_000_000_000;
    expect(EN.agoLabel(null, now)).toBeNull();
    expect(EN.agoLabel(now - 5_000, now)).toBe('just now');
    expect(EN.agoLabel(now - 120_000, now)).toBe('2 min ago');
    expect(EN.agoLabel(now - 7_200_000, now)).toBe('2 h ago');
  });

  it('is honest when the road is empty', () => {
    expect(EN.map.quiet(9)).toContain('9 drivers online');
    expect(EN.map.quiet(1)).toContain('1 driver online');
    expect(EN.map.quiet(0)).toContain('Nobody else out here');
  });

  it('counts waves in the plural only when there is more than one', () => {
    expect(EN.card.waves(1)).toBe('1 wave');
    expect(EN.card.waves(2)).toBe('2 waves');
  });
});

describe('French', () => {
  /*
   * The two rules English never has to apply: the colour follows the model, and it agrees
   * with the model's gender. Every model but the Cybertruck is feminine.
   */
  it('puts the colour after the model and makes it agree', () => {
    expect(FR.cars.describe('Y', 'deepblue')).toBe('Model Y bleue');
    expect(FR.cars.describe('CT', 'deepblue')).toBe('Cybertruck bleu');
    expect(FR.cars.describe('3', 'pearl')).toBe('Model 3 blanche');
    expect(FR.cars.describe('X', 'quicksilver')).toBe('Model X argentée');
    expect(FR.cars.describe('CT', 'quicksilver')).toBe('Cybertruck argenté');
  });

  it('leaves an invariable colour alone', () => {
    expect(FR.cars.describe('CT', 'steel')).toBe('Cybertruck inox');
    expect(FR.cars.describe('S', 'steel')).toBe('Model S inox');
    expect(FR.cars.describe('3', 'red')).toBe('Model 3 rouge');
  });

  it('picks the article the model takes, and contracts nothing it should not', () => {
    expect(FR.wave.prompt('Y', 'deepblue')).toBe('Saluer la Model Y bleue');
    // "Saluer Ghost", never "Saluer la Ghost": a name takes no article in either language.
    expect(FR.wave.promptTargetNamed('Ghost')).toBe('Ghost');
    expect(FR.wave.prompt('CT', 'deepblue')).toBe('Saluer le Cybertruck bleu');
    expect(FR.wave.received('3', 'ultrared')).toBe('Une Model 3 rouge vous a fait signe');
    expect(FR.wave.received('CT', 'ultrared')).toBe('Un Cybertruck rouge vous a fait signe');
  });

  it('keeps the model name itself in the original', () => {
    for (const model of TESLA_MODELS satisfies readonly TeslaModel[]) {
      expect(FR.cars.model(model)).toBe(EN.cars.model(model));
    }
  });

  it('agrees the noun with the count, as English does', () => {
    expect(FR.card.waves(1)).toBe('1 salut');
    expect(FR.card.waves(2)).toBe('2 saluts');
    expect(FR.map.quiet(1)).toContain('1 conducteur en ligne');
    expect(FR.map.quiet(9)).toContain('9 conducteurs en ligne');
    expect(FR.map.quiet(0)).toContain('Personne d’autre');
  });

  it('reads a timestamp the way French does', () => {
    const now = 1_700_000_000_000;
    expect(FR.agoLabel(null, now)).toBeNull();
    expect(FR.agoLabel(now - 5_000, now)).toBe('à l’instant');
    expect(FR.agoLabel(now - 120_000, now)).toBe('il y a 2 min');
    expect(FR.agoLabel(now - 7_200_000, now)).toBe('il y a 2 h');
  });
});
