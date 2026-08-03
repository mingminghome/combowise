import { useEffect, useMemo, useState } from 'react';
import type { Locale, TFunction } from '../core/i18n';
import { LocaleService } from '../core/services/localeService';

/**
 * Reactive locale + `t()` — BabyWise-style language switching.
 */
export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
} {
  const [locale, setLocaleState] = useState<Locale>(() =>
    LocaleService.getLocale()
  );

  useEffect(() => {
    LocaleService.init();
    return LocaleService.subscribe(() => {
      setLocaleState(LocaleService.getLocale());
    });
  }, []);

  const t = useMemo(() => LocaleService.createT(), [locale]);

  return {
    locale,
    setLocale: (next: Locale) => LocaleService.setLocale(next),
    t,
  };
}
