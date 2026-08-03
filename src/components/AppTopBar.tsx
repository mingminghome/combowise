import type { TFunction } from '../core/i18n';
import type { HomeTab } from './BottomNav';
import { TopNavIcons } from './TopNavIcons';

/**
 * Shared chrome for home shell: logo (→ home) + top-right nav (pint / About / Settings).
 * Same bar on Home, Settings, About, and legal sub-pages.
 */
export function AppTopBar({
  tab,
  onNavigate,
  t,
}: {
  tab: HomeTab;
  onNavigate: (tab: HomeTab) => void;
  t: TFunction;
}) {
  return (
    <header className="app-topbar">
      <button
        type="button"
        className="app-topbar-brand"
        onClick={() => onNavigate('home')}
        aria-label={t('appName')}
        title={t('tabs.home')}
      >
        {t('appName')}
      </button>
      <TopNavIcons tab={tab} onChange={onNavigate} t={t} />
    </header>
  );
}

export default AppTopBar;
