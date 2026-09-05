import { beforeEach, describe, expect, it } from 'vitest';
import { EN } from './copy.en';
import { FR } from './copy.fr';
import { useLocaleStore } from './store';

describe('locale store', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocaleStore.setState({ locale: 'en', copy: EN });
    document.documentElement.lang = 'en';
  });

  it('hands out the catalogue for the language in force', () => {
    expect(useLocaleStore.getState().copy).toBe(EN);
    useLocaleStore.getState().setLocale('fr');
    expect(useLocaleStore.getState().copy).toBe(FR);
    expect(useLocaleStore.getState().locale).toBe('fr');
  });

  it('follows the copy with the document language, which is what a screen reader reads', () => {
    useLocaleStore.getState().setLocale('fr');
    expect(document.documentElement.lang).toBe('fr');
    useLocaleStore.getState().setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('remembers a choice made by hand, so the guess does not come back on the next drive', () => {
    useLocaleStore.getState().setLocale('fr');
    expect(localStorage.getItem('tw.locale.v1')).toBe('fr');
  });

  /* The catalogue is what components subscribe to, so it has to be the same object each time
     or the map would re-render every string twice a second. */
  it('keeps one catalogue object per language', () => {
    const { setLocale } = useLocaleStore.getState();
    setLocale('fr');
    const first = useLocaleStore.getState().copy;
    setLocale('en');
    setLocale('fr');
    expect(useLocaleStore.getState().copy).toBe(first);
  });
});
