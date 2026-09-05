import { create } from 'zustand';
import { EN, type Copy } from './copy.en';
import { FR } from './copy.fr';
import { DEFAULT_LOCALE, resolveLocale, type Locale } from './locale';

export const CATALOGUES: Record<Locale, Copy> = { en: EN, fr: FR };

const LOCALE_KEY = 'tw.locale.v1';

/** Storage can throw outright in private mode, so every touch of it is guarded. */
function readStored(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

function writeStored(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Private mode, or storage full. The session still works, it just will not survive a reload.
  }
}

/**
 * Screen readers and the browser's own hyphenation read this, so it has to follow the copy
 * rather than sit at whatever index.html was built with.
 */
function syncDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

/**
 * The language the app is speaking. Detection runs once, when the module is first imported,
 * against the three sources in `resolveLocale`.
 *
 * A `?lang=` link is written straight to storage: arriving by such a link *is* a choice, and
 * a driver who follows one and then loses the language on the next plain visit would rightly
 * call that broken.
 */
const initial = ((): Locale => {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = readStored();
  const locale = resolveLocale({
    search: window.location.search,
    stored,
    preferred: navigator.languages ?? [navigator.language],
  });
  if (locale !== stored) writeStored(locale);
  return locale;
})();

syncDocumentLang(initial);

type LocaleStore = {
  locale: Locale;
  copy: Copy;
  setLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: initial,
  copy: CATALOGUES[initial],

  setLocale: (locale) => {
    writeStored(locale);
    syncDocumentLang(locale);
    set({ locale, copy: CATALOGUES[locale] });
  },
}));

/**
 * Every string the UI shows, in the language in force. Components subscribe to the catalogue
 * rather than the locale tag, so switching language re-renders exactly what has words on it.
 */
export const useCopy = (): Copy => useLocaleStore((s) => s.copy);

export const useLocale = (): Locale => useLocaleStore((s) => s.locale);

export const useSetLocale = (): ((locale: Locale) => void) => useLocaleStore((s) => s.setLocale);
