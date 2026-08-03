import {
  createT,
  localeTag,
  type Locale,
  type TFunction,
} from '../i18n';

const LOCALE_STORAGE_KEY = 'ff_calc_locale';

function isLocale(v: string | null): v is Locale {
  return v === 'en' || v === 'zh-Hant';
}

/**
 * Locale preference (BabyWise-aligned). Stored in localStorage.
 */
export class LocaleService {
  private static subscribers: Set<() => void> = new Set();

  static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notify() {
    this.subscribers.forEach((cb) => cb());
  }

  static getLocale(): Locale {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(stored)) return stored;
    } catch {
      /* ignore */
    }
    return 'en';
  }

  static setLocale(locale: Locale) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (e) {
      console.warn('Failed to save locale:', e);
    }
    document.documentElement.lang = localeTag(locale);
    this.notify();
  }

  static clearStoredLocale() {
    try {
      localStorage.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = 'en';
    this.notify();
  }

  static hasCustomLocale(): boolean {
    try {
      return isLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch {
      return false;
    }
  }

  static createT(): TFunction {
    return createT(this.getLocale());
  }

  /** Apply document lang from stored preference (call at bootstrap). */
  static init() {
    document.documentElement.lang = localeTag(this.getLocale());
  }
}

export { LOCALE_STORAGE_KEY };
