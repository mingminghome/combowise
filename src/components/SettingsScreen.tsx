import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import type { Locale } from '../core/i18n';
import {
  getDataSummary,
  type DataSummary,
} from '../core/services/localDataService';
import { ThemeService, type ThemeMode } from '../core/services/themeService';
import { useLocale } from '../hooks/useLocale';
import { APP_VERSION } from '../version';
import type { HomeTab } from './BottomNav';
import { CleanDataPanel } from './CleanDataPanel';

interface SettingsScreenProps {
  tab: HomeTab;
  onNavigate: (tab: HomeTab) => void;
}

/**
 * Flat Settings (BabyWise-aligned). Chrome top bar is AppTopBar in App.
 */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onNavigate,
}) => {
  const { locale, setLocale, t } = useLocale();
  const [mode, setMode] = useState<ThemeMode>(() => ThemeService.getThemeMode());
  const [summary, setSummary] = useState<DataSummary>(() => getDataSummary());

  const refreshSummary = useCallback(() => {
    setSummary(getDataSummary());
  }, []);

  useEffect(() => {
    ThemeService.init();
    return ThemeService.subscribe(() => setMode(ThemeService.getThemeMode()));
  }, []);

  const setTheme = (next: ThemeMode) => {
    ThemeService.setThemeMode(next);
    setMode(next);
    refreshSummary();
  };

  return (
    <div className="settings-screen">
      <div className="page-heading">
        <h1>{t('settings.title')}</h1>
        <p className="subtitle">{t('settings.subtitle')}</p>
      </div>

      <section className="glass-card settings-card">
        <h2 className="settings-section-title">{t('settings.language')}</h2>
        <div className="settings-chip-row">
          {(
            [
              ['en', 'English'],
              ['zh-Hant', '繁體中文'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`settings-chip${locale === id ? ' is-active' : ''}`}
              onClick={() => {
                setLocale(id as Locale);
                refreshSummary();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card settings-card settings-card--theme">
        <h2 className="settings-section-title">{t('settings.theme')}</h2>
        <div className="settings-chip-row">
          {(
            [
              ['auto', 'settings.themeSystem', Laptop],
              ['light', 'settings.themeLight', Sun],
              ['dark', 'settings.themeDark', Moon],
            ] as const
          ).map(([id, labelKey, Icon]) => (
            <button
              key={id}
              type="button"
              className={`settings-chip${mode === id ? ' is-active' : ''}`}
              onClick={() => setTheme(id)}
            >
              <Icon size={15} strokeWidth={2.2} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      <CleanDataPanel
        t={t}
        summary={summary}
        onRefreshSummary={refreshSummary}
        onCleaned={(cat) => {
          if (cat === 'all' || cat === 'preferences') {
            setMode(ThemeService.getThemeMode());
          }
          if (cat === 'all') {
            onNavigate('home');
          }
        }}
      />

      <p className="settings-version">{t('settings.version', { v: APP_VERSION })}</p>
    </div>
  );
};

export default SettingsScreen;
